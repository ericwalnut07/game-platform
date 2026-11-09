import addonData from "../../../../docs/design/robot-tactics/addons.json";
import { getRobotAddonComparison, getRobotAddonDefinition } from "../../../games/robot-tactics/addonEquipment";
import type { RobotMovementType } from "../../../games/robot-tactics/movement";
import basicData from "../../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotBasicPartComparison } from "../../../games/robot-tactics/partComparison";
import { getRobotLoadoutPlan, getRobotPartyCapBlock, type RobotCoreId, type RobotEquipmentSlot } from "../../../games/robot-tactics/equipment";
import { getRobotFrameComparison, getRobotFrameName, previewRobotCustomization, ROBOT_MOVEMENT_NAMES, ROBOT_STAT_NAMES, type RobotComparisonRow, type RobotCustomizationChange } from "../../../games/robot-tactics/customization";
import { getRobotOfflineAvailability, getRobotOfflineEquipmentName } from "../../../games/robot-tactics/offlineProgress";
import type { RobotOfflineSave } from "../../../games/robot-tactics/offlineSession";
import type { RobotStat } from "../../../games/robot-tactics/growth";
import frameData from "../../../../docs/design/robot-tactics/frames.json";
import { robotFrameArtUrl, robotArtPalette, robotArtPaletteFilter, robotWeaponArtFamily, robotWeaponArtUrl } from "./RobotVisualArt";

import {createRobotVisualSprite} from "./RobotVisualSprite";
import { getRobotWeaponFamily, groupRobotAvailableWeapons, type RobotWeaponFamily } from "./RobotWeaponCategories";
import { describeRobotEquippedCombo } from "./RobotComboSummary";

export interface RobotCustomizationUiState {
  coreId: RobotCoreId | null;
  expandedFrameId: string | null;
  category: "frame" | RobotEquipmentSlot | "addons";
  expandedPartId: string | null;
  /** Opened family is UI-only; survives detail/equipment/level re-renders. */
  expandedWeaponFamily: RobotWeaponFamily | null;
  addonMovementType: RobotMovementType | null;
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
  const capBlock = getRobotPartyCapBlock(state.progress.party, available);
  if (capBlock) root.append(node("p", capBlock, "custom-reason"));
  if (!core) {
    root.append(node("h2", "機体カスタマイズ"), node("p", `共有EXP ${state.progress.exp}`, "custom-exp"));
    const list = node("div", undefined, "custom-party"); list.setAttribute("aria-label", "操作機3コア");
    for (const c of state.progress.party) {
      const plan = getRobotLoadoutPlan(c, available), card = button(`${coreName(c.coreId)} · ${getRobotFrameName(c.frameId)} · Lv${c.coreLevel}`, () => { ui.coreId = c.coreId; ui.expandedFrameId = null; ui.category = "frame"; ui.expandedPartId = null; ui.addonMovementType = null; ui.scrollTop = 0; options.refresh(); });
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
  const appearance=node("div",undefined,"custom-machine-art");appearance.setAttribute("aria-label","現在のフレームと装備武器の外観");
  const preview=doc.createElementNS("http://www.w3.org/2000/svg","svg");preview.setAttribute("viewBox","0 0 1 1");preview.setAttribute("role","img");preview.setAttribute("aria-label",getRobotFrameName(core.frameId)+"・武器①");preview.classList.add("custom-machine-body");
  const fallback=doc.createElementNS("http://www.w3.org/2000/svg","rect");for(const[k,v]of Object.entries({x:".2",y:".2",width:".6",height:".6",rx:".12",fill:"#2879bf"}))fallback.setAttribute(k,v);
  preview.append(createRobotVisualSprite(doc,{frameId:core.frameId,palette:robotArtPalette(core.frameId),weaponFamily:robotWeaponArtFamily(core.basic.weapon1.partId),slot:1,fallback,portrait:true}));appearance.append(preview);
  const weapons=node("div",undefined,"custom-machine-weapons");
  for(const slot of ["weapon1","weapon2"] as const){
    const family=robotWeaponArtFamily(core.basic[slot].partId),source=family&&robotWeaponArtUrl(family),item=node("div",undefined,"custom-machine-weapon");
    if(source){const image=node("img");image.src=source;image.alt=getRobotOfflineEquipmentName(core.basic[slot].partId);image.onerror=()=>image.remove();item.append(image);}
    item.append(node("small",slot==="weapon1"?"武器①":"武器②"),node("span",getRobotOfflineEquipmentName(core.basic[slot].partId)));weapons.append(item);
  }
  appearance.append(weapons);
  const combo = describeRobotEquippedCombo(core.basic.weapon1, core.basic.weapon2);
  const comboInfo = node("section", undefined, "custom-equipped-combo");
  comboInfo.setAttribute("aria-label", "装備中の武装コンボ");
  comboInfo.append(
    node("small", "武装コンボ"),
    node("strong", combo.name, "custom-equipped-combo-name"),
    node("small", `${combo.families} ／ 消費EN${combo.energyCost}`, "custom-equipped-combo-meta"),
    node("p", combo.description, "custom-equipped-combo-description"),
  );
  appearance.append(comboInfo);
  summary.append(appearance);
  const stats = node("dl", undefined, "custom-stats");
  for (const stat of Object.keys(ROBOT_STAT_NAMES) as RobotStat[]) { const pair = node("div"); pair.append(node("dt", ROBOT_STAT_NAMES[stat]), node("dd", String(plan.effectiveStats[stat] ?? "未確定"))); stats.append(pair); }
  summary.append(stats);
  if (core.addons.length) {
    summary.append(node("small", "上記は基本装備までの能力値です。EN回復・移動設定・シールド強化・薙ぎ払い拡張は、この表の数値を変えません。その他の追加効果は準備中です。"));
    if (plan.movement) summary.append(node("small", "選択中の移動タイプ：" + plan.movement.types.map(t => ROBOT_MOVEMENT_NAMES[t]).join("・")));
  }
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
  const favorites = node("details", undefined, "custom-favorites");
  const entries = state.progress.favorites?.[core.coreId] ?? [];
  favorites.append(node("summary", `お気に入り（${entries.length}/5）`));
  const favoriteName = node("input"); favoriteName.type = "text"; favoriteName.maxLength = 512; favoriteName.setAttribute("aria-label", "新しいお気に入りの名前");
  const register = node("form", undefined, "favorite-actions");
  const save = button("現在の構成を登録", () => {}, entries.length >= 5); save.type = "submit";
  register.onsubmit = event => { event.preventDefault(); if (!options.busy && entries.length < 5) options.apply({ kind: "favorite-save", coreId: core.coreId, name: favoriteName.value }, state.revision); };
  register.append(favoriteName, save); favorites.append(register);
  favorites.append(node("small", "フレーム・武器2枠・基本パーツ・追加パーツと移動設定を保存します。パーツLvは呼び出す時点の共有Lvを使います。"));
  entries.forEach((favorite, index) => {
    const entry = node("section", undefined, "favorite-entry"); entry.setAttribute("aria-label", `お気に入り${index + 1}：${favorite.name}`);
    entry.append(node("h3", favorite.name), node("small", getRobotFrameName(favorite.frameId) + " / " + Object.values(favorite.basic).map(getRobotOfflineEquipmentName).join("・")), node("small", "追加：" + (favorite.addons.map(a => getRobotOfflineEquipmentName(a.partId) + (a.movementType ? `（${ROBOT_MOVEMENT_NAMES[a.movementType]}）` : "")).join("・") || "なし")));
    const recall = { kind: "favorite-apply" as const, coreId: core.coreId, sourceCoreId: core.coreId, index }, preview = previewRobotCustomization(state.progress, recall);
    entry.append(button("呼び出す", () => options.apply(recall, state.revision), !preview.canApply));
    if (preview.reasons.length) entry.append(node("small", preview.reasons.join(" "), "custom-reason"));
    const copyArea = node("div", undefined, "favorite-actions"), target = node("select"); target.setAttribute("aria-label", "コピー先のコア"); target.disabled = options.busy;
    for (const c of state.progress.party.filter(c => c.coreId !== core.coreId)) { const option = node("option", coreName(c.coreId)); option.value = c.coreId; target.append(option); }
    const copyChange = () => ({ ...recall, coreId: target.value as RobotCoreId });
    const copy = button("このコアへコピー", () => options.apply(copyChange(), state.revision)), reason = node("small", undefined, "custom-reason");
    const updateCopy = () => { const p = previewRobotCustomization(state.progress, copyChange()); copy.disabled = options.busy || !p.canApply; reason.textContent = p.reasons.join(" "); };
    target.onchange = updateCopy; updateCopy(); copyArea.append(target, copy); entry.append(copyArea, reason);
    const edit = node("details"); edit.append(node("summary", "名前変更・上書き・削除"));
    const name = node("input"); name.type = "text"; name.maxLength = 512; name.value = favorite.name; name.setAttribute("aria-label", "お気に入りの名前");
    edit.append(name, button("名前を変更", () => options.apply({ kind: "favorite-rename", coreId: core.coreId, index, name: name.value }, state.revision)), button("現在の構成で上書き", () => options.apply({ kind: "favorite-save", coreId: core.coreId, index, name: name.value }, state.revision)), button("お気に入りを削除", () => options.apply({ kind: "favorite-delete", coreId: core.coreId, index }, state.revision)));
    entry.append(edit); favorites.append(entry);
  });
  root.append(favorites);
  const categories = node("nav", undefined, "performance-categories"); categories.setAttribute("aria-label", "装備カテゴリー");
  for (const [id, label] of [["frame", "フレーム"], ["weapon1", "武器①"], ["weapon2", "武器②"], ["engine", "エンジン"], ["armor", "装甲"], ["control", "制御"], ["special", "特殊"], ["addons", "追加パーツ"]] as const) {
    const b = button(label, () => {
      ui.category = id;
      ui.expandedFrameId = null;
      ui.expandedPartId = null;
      ui.expandedWeaponFamily = id === "weapon1" || id === "weapon2"
        ? getRobotWeaponFamily(core.basic[id].partId) : null;
      ui.addonMovementType = null;
      options.refresh();
    });
    b.setAttribute("aria-pressed", String(ui.category === id)); categories.append(b);
  }
  root.append(categories);
  if (ui.category === "frame") {
  root.append(node("h3", "フレームを選択"));
  const frames = node("div", undefined, "custom-frame-list"); frames.setAttribute("aria-label", "フレーム一覧");
  for (const f of frameData.frames.filter(f => available.frames.includes(f.id))) {
    const preview = previewRobotCustomization(state.progress, { kind: "frame", coreId: core.coreId, frameId: f.id });
    const section = node("section"), selected = core.frameId === f.id;
    const b = button(`${getRobotFrameName(f.id)}${selected ? " · 装備中" : !available.frames.includes(f.id) ? " · 未解放" : ""}`, () => { ui.expandedFrameId = ui.expandedFrameId === f.id ? null : f.id; options.refresh(); });
    const art = robotFrameArtUrl(f.id);
    if (art) {
      const image = node("img"); image.src = art; image.alt = ""; image.className = "custom-frame-thumbnail"; image.style.filter = robotArtPaletteFilter(robotArtPalette(f.id)); image.onerror=()=>image.remove();
      b.prepend(image);
    }
    b.setAttribute("aria-expanded", String(ui.expandedFrameId === f.id)); b.setAttribute("aria-controls", "frame-detail-" + f.id); section.append(b);
    if (ui.expandedFrameId === f.id) {
      const detail = node("div", undefined, "custom-part-detail"); detail.id = "frame-detail-" + f.id;
      detail.append(comparisonTable(getRobotFrameComparison(f.id, core.frameId, core.coreLevel)));
      const owner = state.progress.party.find(c => c.coreId !== core.coreId && c.frameId === f.id);
      if (owner) detail.append(node("p", `${coreName(owner.coreId)}とフレームを交換します。コアLv・武器・パーツは各コアに残ります。`));
      if (preview.reasons.length) detail.append(node("p", preview.reasons.join(" "), "custom-reason"));
      detail.append(button("装備する", () => options.apply({ kind: "frame", coreId: core.coreId, frameId: f.id }, state.revision), !preview.canApply)); section.append(detail);
    }
    frames.append(section);
  }
  root.append(frames);
  } else if (ui.category === "addons") {
    root.append(node("h3", "追加パーツ"), node("p", `装備中 ${core.addons.length}個 · 解放済み ${available.addons.length}/${addonData.parts.length}種類。CAP超過の構成も保存できます。出撃前にCAP内へ調整してください。`, "muted"));
    const list = node("div", undefined, "custom-frame-list"); list.setAttribute("aria-label", "追加パーツ一覧");
    for (const row of addonData.parts.filter(p => available.addons.includes(p.id))) {
      const part = getRobotAddonDefinition(row.id), section = node("section"), equipped = core.addons.find(a => a.partId === part.id), owned = available.addons.includes(part.id);
      const b = button(part.name + (equipped ? " · 装備中" : owned ? "" : " · 未解放"), () => {
        ui.expandedPartId = ui.expandedPartId === part.id ? null : part.id; ui.addonMovementType = equipped?.movementType ?? null; options.refresh();
      }); b.setAttribute("aria-expanded", String(ui.expandedPartId === part.id)); b.setAttribute("aria-controls", "addon-detail-" + part.id); section.append(b);
      if (ui.expandedPartId === part.id) {
        const detail = node("div", undefined, "custom-part-detail"); detail.id = "addon-detail-" + part.id;
        detail.append(comparisonTable(getRobotAddonComparison(part.id, core), "追加パーツの性能とCAP差分", equipped ? "解除時の差" : "追加時の差"));
        if (part.scope !== "unit") {
          const slots = (plan.addons.find(a => a.id === part.id) ?? getRobotLoadoutPlan({ ...core, addons: [...core.addons, { partId: part.id }] }, { ...available, addons: [...new Set([...available.addons, part.id])] }).addons.find(a => a.id === part.id))!.eligibleWeaponSlots;
          detail.append(node("small", slots.length ? "系統・★条件に合う武器：" + slots.map(slot => slot === "weapon1" ? "武器①" : "武器②").join("・") : "系統・★条件に合う装備武器なし。装備は可能です。"));
          detail.append(node("small", "発動時の射程などの条件は効果説明を確認してください。"));
        }
        if (part.movementChoices) {
          const label = node("label", "装備時の移動タイプ"), select = node("select"); select.setAttribute("aria-label", "装備時の移動タイプ"); select.disabled = options.busy;
          const blank = node("option", "選択してください"); blank.value = ""; select.append(blank);
          for (const type of part.movementChoices) { const option = node("option", ROBOT_MOVEMENT_NAMES[type]); option.value = type; select.append(option); }
          select.value = ui.addonMovementType ?? "";
          select.onchange = () => { ui.addonMovementType = select.value ? select.value as RobotMovementType : null; options.refresh(); }; label.append(select); detail.append(label);
          if (equipped) detail.append(node("small", "タイプの設定変更ではCAPは変わりません。"));
        }
        if (!equipped || part.movementChoices) {
          const change = ui.addonMovementType === null ? { kind: "addon-equip" as const, coreId: core.coreId, partId: part.id } : { kind: "addon-equip" as const, coreId: core.coreId, partId: part.id, movementType: ui.addonMovementType };
          const preview = previewRobotCustomization(state.progress, change);
          detail.append(button(equipped ? "設定を変更する" : "装備する", () => options.apply(change, state.revision), !preview.canApply));
          if (preview.reasons.length) detail.append(node("small", preview.reasons.join(" "), "custom-reason"));
        }
        if (equipped) {
          const change = { kind: "addon-remove" as const, coreId: core.coreId, partId: part.id }, preview = previewRobotCustomization(state.progress, change);
          detail.append(button("装備を解除する", () => options.apply(change, state.revision), !preview.canApply));
          if (preview.reasons.length) detail.append(node("small", preview.reasons.join(" "), "custom-reason"));
        }
        section.append(detail);
      }
      list.append(section);
    }
    root.append(list);
  } else {
    const slot = ui.category, list = node("div", undefined, "custom-frame-list"); list.setAttribute("aria-label", names[slot] + "のパーツ一覧");
    root.append(node("h3", names[slot] + "を選択"), node("p", "パーツIDごとの共有Lvです。強化は装備中の全コアへ反映し、外した後もLvを保持します。", "muted"));
    const isWeapon = slot === "weapon1" || slot === "weapon2";
    const groups = isWeapon ? groupRobotAvailableWeapons(available.basicParts) : [];
    // The nav initializes this to the equipped family. Null means the user
    // has deliberately collapsed the open family, so keep all groups closed.
    const activeFamily = ui.expandedWeaponFamily;
    const parts = basicData.parts.filter(p =>
      available.basicParts.includes(p.id) && p.slot === (isWeapon ? "weapon" : slot));
    const createPartRow = (part: (typeof basicData.parts)[number]) => {
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
      return section;
    };
    if (isWeapon) {
      for (const group of groups) {
        const section = node("section", undefined, "custom-weapon-family");
        section.dataset.weaponFamily = group.id;
        const open = group.id === activeFamily;
        const toggle = button(`${group.name}系（${group.parts.length}）`, () => {
          ui.expandedWeaponFamily = open ? null : group.id;
          ui.expandedPartId = null;
          options.refresh();
        });
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-controls", `weapon-family-${slot}-${group.id}`);
        section.append(toggle);
        if (open) {
          const contents = node("div", undefined, "custom-weapon-family-parts");
          contents.id = `weapon-family-${slot}-${group.id}`;
          if (!group.parts.length) contents.append(node("small", "解放済み武器なし", "muted"));
          else for (const part of group.parts) contents.append(createPartRow(part));
          section.append(contents);
        }
        list.append(section);
      }
    } else {
      for (const part of parts) list.append(createPartRow(part));
    }
    root.append(list);
  }
  return root;

  function comparisonTable(rows: readonly RobotComparisonRow[], name = "フレーム性能と現在装備との差分", differenceLabel = "現在装備との差") {
    const table = node("table", undefined, "custom-comparison"); table.setAttribute("aria-label", name);
    const head = node("thead"), header = node("tr"); for (const label of ["項目", "性能", differenceLabel]) { const th = node("th", label); th.scope = "col"; header.append(th); } head.append(header); table.append(head);
    const body = node("tbody");
    for (const r of rows) { const tr = node("tr"), label = node("th", r.label); label.scope = "row"; tr.append(label, node("td", r.value), node("td", r.difference, "difference-" + r.tone)); body.append(tr); }
    table.append(body); return table;
  }
}
