import basicData from "../../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotWeaponComboPlan } from "../../../games/robot-tactics/weaponActions";
import addonData from "../../../../docs/design/robot-tactics/addons.json";
import finalAddonPolicy from "../../../../docs/design/robot-tactics/addons-final-policy-2026-11-04.json";
import { getRobotAddonCost } from "../../../games/robot-tactics/combatAddons";
import frameData from "../../../../docs/design/robot-tactics/frames.json";
import { createRobotPerformanceDraft, getRobotPerformanceReport, setRobotPerformancePart, type RobotPerformanceDamage, type RobotPerformanceDraft } from "../../../games/robot-tactics/performanceCheck";
import { getRobotBasicPartComparison, getRobotPerformanceEquipmentIssueText } from "../../../games/robot-tactics/partComparison";
import { getRobotFrameComparison, getRobotFrameName, ROBOT_MOVEMENT_NAMES, ROBOT_STAT_NAMES, type RobotComparisonRow } from "../../../games/robot-tactics/customization";
import { getRobotOfflineEquipmentName, getRobotOfflineAvailability, type RobotOfflineProgress } from "../../../games/robot-tactics/offlineProgress";
import type { RobotEquipmentSlot } from "../../../games/robot-tactics/equipment";
import { ROBOT_CORE_LEVEL_MAX, ROBOT_PART_LEVEL_MAX, type RobotStat } from "../../../games/robot-tactics/growth";
import type { RobotMovementType } from "../../../games/robot-tactics/movement";

type Category = "frame" | RobotEquipmentSlot | "addons";
export interface RobotPerformanceUiState {
  draft: RobotPerformanceDraft; category: Category; expandedId: string | null;
  partLevel: number; equipmentOpen: boolean; enemyOpen: boolean; movementType: RobotMovementType | null; scrollTop: number;
}
export function createRobotPerformanceUi(progress: RobotOfflineProgress): RobotPerformanceUiState {
  return { draft: createRobotPerformanceDraft(progress), category: "frame", expandedId: null, partLevel: 1, equipmentOpen: false, enemyOpen: true, movementType: null, scrollTop: 0 };
}
/** No Session or storage/write callback is accepted. All edits stay in this view's
 * scratch object, including free levels, locked equipment and invalid CAP builds.
 */
export function renderRobotPerformanceScreen(doc: Document, progress: RobotOfflineProgress, ui: RobotPerformanceUiState): HTMLElement {
  const root = doc.createElement("div"); root.className = "robot-performance";
  let statsHost: HTMLElement, resultHost: HTMLElement, comparisonHost: HTMLElement | null = null, currentEnInput: HTMLInputElement | null = null;
  let errors: Record<string, string> = {};
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;
  };
  const button = (label: string, act: () => void) => { const b = node("button", label); b.type = "button"; b.onclick = act; return b; };
  function select<T extends string>(label: string, selected: T, choices: readonly (readonly [T, string])[], changed: (value: T) => void) {
    const wrapper = node("label", label), input = node("select"); input.setAttribute("aria-label", label);
    for (const [value, text] of choices) { const option = node("option", text); option.value = value; input.append(option); }
    input.value = selected; input.onchange = () => changed(input.value as T); wrapper.append(input); return wrapper;
  }
  function number(label: string, value: number, changed: (value: number) => void, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const wrapper = node("label", label), input = node("input"), error = node("small", "", "performance-input-error");
    input.setAttribute("aria-label", label);
    input.type = "number"; input.inputMode = "numeric"; input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(value);
    input.oninput = () => {
      const value = Number(input.value);
      if (input.value.trim() === "" || !Number.isSafeInteger(value) || value < min || value > max) { errors[label] = `${label}は${min}〜${max}の整数で入力してください。`; error.textContent = errors[label]!; input.setAttribute("aria-invalid", "true"); }
      else { delete errors[label]; error.textContent = ""; input.removeAttribute("aria-invalid"); changed(value); }
      updateOutputs(); if (comparisonHost) updateComparison();
    };
    wrapper.append(input, error); return { wrapper, input };
  }
  function checkbox(label: string, checked: boolean, changed: (value: boolean) => void) {
    const wrapper = node("label", undefined, "performance-check"), input = node("input"); input.type = "checkbox"; input.checked = checked;
    input.onchange = () => { changed(input.checked); updateOutputs(); }; wrapper.append(input, node("span", label)); return wrapper;
  }
  function core() { return ui.draft.party.find(c => c.coreId === ui.draft.coreId)!; }
  function setCore(change: Partial<ReturnType<typeof core>>) { ui.draft = { ...ui.draft, party: ui.draft.party.map(c => c.coreId === ui.draft.coreId ? { ...c, ...change } : c) }; }
  function reset() { Object.assign(ui, createRobotPerformanceUi(progress)); render(); }
  function render() {
    errors = {}; comparisonHost = null; currentEnInput = null;
    const intro = node("p", "一時的な試算です。実際の装備・EXP・ミッション進行には反映しません。", "muted");
    const controls = node("div", undefined, "performance-toolbar");
    controls.append(select("試算するコア", ui.draft.coreId, progress.party.map(c => [c.coreId, "コア" + c.coreId.slice(-1).toUpperCase()] as const), value => { ui.draft = { ...ui.draft, coreId: value }; ui.expandedId = null; render(); }), button("現在の構成を読み直す", reset));
    const level = number("仮コアLv", core().coreLevel, value => setCore({ coreLevel: value }), 1, ROBOT_CORE_LEVEL_MAX); controls.append(level.wrapper);
    statsHost = node("section", undefined, "performance-stats"); statsHost.setAttribute("aria-label", "仮構成の性能");
    resultHost = node("section", undefined, "performance-results"); resultHost.setAttribute("aria-label", "試算結果"); resultHost.setAttribute("aria-live", "polite");
    const conditions = node("section", undefined, "performance-conditions"); conditions.setAttribute("aria-label", "攻撃・防御条件"); conditions.append(node("h3", "攻撃・防御条件"));
    conditions.append(select("使用武器", ui.draft.weaponSlot, ["weapon1", "weapon2"].map(slot => [slot as "weapon1" | "weapon2", (slot === "weapon1" ? "武器①：" : "武器②：") + getRobotOfflineEquipmentName(core().basic[slot as "weapon1" | "weapon2"].partId)] as const), value => { ui.draft = { ...ui.draft, weaponSlot: value, targetCount: 1 }; render(); }));
    conditions.append(select("攻撃方法", ui.draft.attack, [["normal", "通常単体"], ["sweep", "薙ぎ払い"], ["burst-center", "爆撃攻撃：中心1体"], ["burst-neighbor", "爆撃攻撃：周辺1体"], ["overwatch", "迎撃：1体"], ["combo", "武装コンボ"]] as const, value => { ui.draft = { ...ui.draft, attack: value, targetCount: 1 }; render(); }));
    if (ui.draft.attack === "sweep") conditions.append(number("合法な対象数（同じ性能の敵）", ui.draft.targetCount, value => { ui.draft = { ...ui.draft, targetCount: value }; }, 1, 3).wrapper);
    let spread = false;
    if (ui.draft.attack === "combo") { try { spread = getRobotWeaponComboPlan(core().basic.weapon1, core().basic.weapon2).kind === "ranged-ranged"; } catch { /* Invalid hypothetical builds keep the normal report error. */ } }
    if (spread) conditions.append(number("合法な対象数（同じ性能の敵）", ui.draft.targetCount, value => { ui.draft = { ...ui.draft, targetCount: value }; }, 1, 9).wrapper);
    if (ui.draft.attack === "combo") conditions.append(node("small", "武器①②を組み合わせます。双対象は同じ性能の別々の敵2体、二武器連撃は同じ敵へ順番に命中します。"));
    conditions.append(select("両方向の攻撃条件", ui.draft.hitCondition, [["valid", "合法な命中が成立"], ["out-of-range", "射程外"], ["wall", "壁による射線遮断"], ["non-damaging", "ダメージを与えない効果"]] as const, value => { ui.draft = { ...ui.draft, hitCondition: value }; updateOutputs(); }));
    conditions.append(checkbox("仮想敵が基本シールド中", ui.draft.enemyShield, value => { ui.draft = { ...ui.draft, enemyShield: value }; }), checkbox("自機がシールド中（基本パーツを反映）", ui.draft.ownShield, value => { ui.draft = { ...ui.draft, ownShield: value }; }));
    const energy = node("div", undefined, "performance-energy");
    energy.append(checkbox("自機ENを仮構成の最大値にする", ui.draft.currentEn === null, value => { ui.draft = { ...ui.draft, currentEn: value ? null : lastMaxEn() }; }));
    const en = number("自機の現在EN", ui.draft.currentEn ?? lastMaxEn(), value => { ui.draft = { ...ui.draft, currentEn: value }; }); currentEnInput = en.input; energy.append(en.wrapper); conditions.append(energy);
    const enemy = node("details", undefined, "performance-enemy"); enemy.open = ui.enemyOpen; enemy.ontoggle = () => { if (enemy.isConnected) ui.enemyOpen = enemy.open; }; enemy.append(node("summary", "仮想敵の能力・武器を変更"));
    const enemyFields = node("div", undefined, "performance-fields");
    for (const [key, label, min] of [["hp", "敵HP", 1], ["melee", "敵近接攻撃", 0], ["ranged", "敵射撃攻撃", 0], ["def", "敵DEF", Number.MIN_SAFE_INTEGER], ["en", "敵EN", 0], ["weaponPower", "敵武器威力", 0]] as const) enemyFields.append(number(label, ui.draft.enemy[key], value => { ui.draft = { ...ui.draft, enemy: { ...ui.draft.enemy, [key]: value } }; }, min).wrapper);
    enemyFields.append(select("敵の仮想武器系統", ui.draft.enemy.family, [["slash", "斬撃"], ["blunt", "打撃"], ["thrust", "刺突"], ["assault", "連射"], ["sniper", "狙撃"], ["blast", "爆撃"]] as const, value => { ui.draft = { ...ui.draft, enemy: { ...ui.draft.enemy, family: value } }; updateOutputs(); }));
    enemy.append(enemyFields, node("small", "受ける攻撃は単体・倍率100%の仮想攻撃です。固有の追加効果・爆風は含みません。"));
    const equipment = node("details", undefined, "performance-equipment"); equipment.open = ui.equipmentOpen; equipment.ontoggle = () => { if (equipment.isConnected) ui.equipmentOpen = equipment.open; }; equipment.append(node("summary", "仮装備・パーツ性能を比較"));
    const categories = node("nav", undefined, "performance-categories"); categories.setAttribute("aria-label", "仮装備カテゴリー");
    for (const [id, label] of [["frame", "フレーム"], ["weapon1", "武器①"], ["weapon2", "武器②"], ["engine", "エンジン"], ["armor", "装甲"], ["control", "制御"], ["special", "特殊"], ["addons", "追加パーツ"]] as const) {
      const b = button(label, () => { ui.category = id; ui.expandedId = null; if (id !== "frame" && id !== "addons") ui.partLevel = core().basic[id].level; renderEquipment(); }); b.setAttribute("aria-pressed", String(ui.category === id)); categories.append(b);
    }
    const equipmentHost = node("div");
    equipment.append(categories, equipmentHost);
    root.replaceChildren(node("h2", "性能チェック"), intro, controls, statsHost, resultHost, conditions, enemy, equipment, node("p", "合法な対象へのダメージ試算です。配置・射線の判定、移動、状態付与、連携技と全戦闘の進行は再現しません。", "muted"));
    renderEquipment(); updateOutputs();

    function renderEquipment() {
      comparisonHost = null; delete errors["比較するパーツLv"];
      for (const b of categories.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.textContent === ({ frame: "フレーム", weapon1: "武器①", weapon2: "武器②", engine: "エンジン", armor: "装甲", control: "制御", special: "特殊", addons: "追加パーツ" })[ui.category]));
      const list = node("div", undefined, "performance-part-list"); list.setAttribute("aria-label", "仮パーツ一覧");
      const category = ui.category;
      if (category !== "frame" && category !== "addons") list.append(number("比較するパーツLv", ui.partLevel, value => { ui.partLevel = value; }, 1, ROBOT_PART_LEVEL_MAX).wrapper);
      const rows = category === "frame" ? frameData.frames.map(f => ({ id: f.id, name: getRobotFrameName(f.id) })) : category === "addons" ? addonData.parts.map(a => ({ id: a.id, name: a.name })) : basicData.parts.filter(p => p.slot === (category === "weapon1" || category === "weapon2" ? "weapon" : category)).map(p => ({ id: p.id, name: p.name }));
      const available = getRobotOfflineAvailability(progress);
      for (const row of rows) {
        const section = node("section"), owned = (category === "frame" ? available.frames : category === "addons" ? available.addons : available.basicParts).includes(row.id);
        const b = button(row.name + (owned ? "" : " · 未解放"), () => { ui.expandedId = ui.expandedId === row.id ? null : row.id; renderEquipment(); }); b.setAttribute("aria-expanded", String(ui.expandedId === row.id)); section.append(b);
        if (ui.expandedId === row.id) {
          const detail = node("div", undefined, "custom-part-detail"); comparisonHost = node("div"); detail.append(comparisonHost);
          if (category === "addons") {
            const addon = addonData.parts.find(a => a.id === row.id)!, effect = addon.effect as unknown as Record<string, unknown>;
            detail.append(node("p", addon.description));
            const equipped = core().addons.some(a => a.partId === row.id), needsMovement = ["replace-movement-type", "union-movement-types"].includes(String(effect.type));
            if (!equipped && needsMovement) detail.append(select("仮の移動タイプ", ui.movementType ?? "", [["", "選択してください"], ...Object.entries(ROBOT_MOVEMENT_NAMES).map(([id, label]) => [id, label] as const)], value => { ui.movementType = value ? value as RobotMovementType : null; renderEquipment(); }));
            const use = button(equipped ? "仮装備から外す" : "試算に追加", () => { setCore({ addons: equipped ? core().addons.filter(a => a.partId !== row.id) : [...core().addons, needsMovement ? { partId: row.id, movementType: ui.movementType! } : { partId: row.id }] }); render(); }); use.disabled = !equipped && needsMovement && !ui.movementType; detail.append(use);
          } else detail.append(button("試算に使う", () => {
            if (Object.keys(errors).length) return;
            if (category === "frame") setCore({ frameId: row.id });
            else { ui.draft = setRobotPerformancePart(ui.draft, category, { partId: row.id, level: ui.partLevel }); }
            render();
          }));
          section.append(detail);
        }
        list.append(section);
      }
      equipmentHost.replaceChildren(list); updateComparison(); updateOutputs();
    }
  }
  function lastMaxEn() { try { return getRobotPerformanceReport(progress, { ...ui.draft, currentEn: null }).plan.effectiveStats.en ?? 0; } catch { return 0; } }
  function updateComparison() {
    if (!comparisonHost || !ui.expandedId) return;
    try {
      let rows: readonly RobotComparisonRow[];
      if (ui.category === "frame") rows = getRobotFrameComparison(ui.expandedId, core().frameId, core().coreLevel);
      else if (ui.category === "addons") { const addon = addonData.parts.find(a => a.id === ui.expandedId)!; const equipped = core().addons.some(a => a.partId === addon.id); rows = [{ label: "必要CAP", value: String(addon.cap), difference: (equipped ? "-" : "+") + addon.cap, tone: equipped ? "better" : "worse" }]; }
      else rows = getRobotBasicPartComparison({ partId: ui.expandedId, level: ui.partLevel }, core().basic[ui.category]);
      const table = node("table", undefined, "custom-comparison"); table.setAttribute("aria-label", "仮パーツ性能と現在の仮装備との差分");
      const head = node("thead"), header = node("tr"); for (const label of ["項目", "性能", "現在装備との差"]) { const th = node("th", label); th.scope = "col"; header.append(th); } head.append(header); table.append(head);
      const body = node("tbody"); for (const r of rows) { const tr = node("tr"), th = node("th", r.label); th.scope = "row"; tr.append(th, node("td", r.value), node("td", r.difference, "difference-" + r.tone)); body.append(tr); } table.append(body); comparisonHost.replaceChildren(table);
    } catch { comparisonHost.replaceChildren(node("p", "パーツとLvを確認してください。")); }
  }
  function damageCard(label: string, result: RobotPerformanceDamage | null) {
    const card = node("section", undefined, "performance-damage"), value = node("output", result ? String(result.totalDamage) : "—"); value.setAttribute("aria-label", label); card.append(node("h3", label), value);
    if (result) {
      card.append(node("small", `実HP減少 ${result.actualHpDamage} · 自傷 ${result.recoil}`));
      if (label === "与ダメージ") card.append(node("small", `必要EN ${result.requiredEn}`));
      if (result.reason) card.append(node("small", result.reason));
      if (result.hits.length > 1) card.append(node("small", result.hits.map(h => `${h.label} ${h.damage}`).join(" / ")));
    }
    return card;
  }
  function updateOutputs() {
    if (!statsHost || !resultHost) return;
    if (Object.keys(errors).length) { resultHost.replaceChildren(damageCard("与ダメージ", null), damageCard("被ダメージ", null), node("p", "入力値を確認してください。", "performance-message")); return; }
    try {
      const report = getRobotPerformanceReport(progress, ui.draft), stats = node("dl", undefined, "custom-stats");
      for (const stat of Object.keys(ROBOT_STAT_NAMES) as RobotStat[]) { const pair = node("div"); pair.append(node("dt", ROBOT_STAT_NAMES[stat]), node("dd", String(report.plan.effectiveStats[stat] ?? "未確定"))); stats.append(pair); }
      const legal = report.equipmentIssues.length === 0, status = node("p", legal ? "装備条件を満たしています" : "実戦では使用不可：" + [...new Set(report.equipmentIssues.map(getRobotPerformanceEquipmentIssueText))].join("、"), legal ? "muted" : "performance-message"); status.setAttribute("role", "status");
      statsHost.replaceChildren(node("h3", `${getRobotFrameName(core().frameId)} · CAP ${report.plan.capUsed}/${report.plan.capLimit}`), stats, status);
      if (core().addons.length) statsHost.append(node("small", "能力表示は基本装備までです。EN回復・移動設定はダメージ値を変えません。シールド強化はシールド中の被ダメージに、薙ぎ払い拡張は対象上限とENに反映します。その他の追加効果は未対応です。"));
      if (report.shield && ui.draft.ownShield) statsHost.append(node("small", `シールド発動EN ${report.shield.energyCost} · 発動後の状態として試算`));
      for (const addon of core().addons) {
        const adopted = (finalAddonPolicy.energy as Record<string, { field: string; kind: string; provisional: boolean }>)[addon.partId];
        if (!adopted) continue;
        const name = addonData.parts.find(a => a.id === addon.partId)!.name, cost = getRobotAddonCost(addon.partId, adopted.field);
        const condition = addon.partId === "blast-target-expander" ? "（周辺3〜4体使用時、1行動1回）" : addon.partId === "double-detonation-control" && core().addons.some(a => a.partId === "blast-target-expander") ? "（拡張枠使用時は合計30）" : adopted.provisional ? "（暫定・爆発効果は未確定）" : "";
        statsHost.append(node("small", `${name}：${adopted.kind === "additional" ? "追加" : adopted.kind === "total" ? "合計" : "専用行動"}EN${cost}${condition}`));
      }
      resultHost.replaceChildren(damageCard("与ダメージ", report.dealt), damageCard("被ダメージ", report.received));
      for (const message of report.unsupported) resultHost.append(node("p", message, "performance-message"));
      if (currentEnInput) { currentEnInput.disabled = ui.draft.currentEn === null; if (ui.draft.currentEn === null) currentEnInput.value = String(report.plan.effectiveStats.en ?? 0); }
    } catch (error) { resultHost.replaceChildren(damageCard("与ダメージ", null), damageCard("被ダメージ", null), node("p", error instanceof Error && /[ぁ-龥]/.test(error.message) ? error.message : "数値や装備の組み合わせを確認してください。", "performance-message")); }
  }
  render(); return root;
}
