import { getRobotStagePlan } from "../../../games/robot-tactics/stageCatalog";
import { getRobotLoadoutPlan } from "../../../games/robot-tactics/equipment";
import { getRobotOfflineAvailability, getRobotOfflineEquipmentName, isRobotMissionUnlocked, ROBOT_DIFFICULTIES, robotMissionId, robotMissionRow } from "../../../games/robot-tactics/offlineProgress";
import { RobotOfflineSession, ROBOT_OFFLINE_SAVE_MAX_BYTES, type RobotOfflineBattle, type RobotOfflineSave } from "../../../games/robot-tactics/offlineSession";
import type { RobotStageKey } from "../../../games/robot-tactics/types";

export interface RobotOfflineAppOptions {
  readonly session: RobotOfflineSession;
  /** Only a complete, validated engine/UI adapter may mount a real battle here. */
  readonly mountBattle?: (root: HTMLElement, battle: RobotOfflineBattle, changed: () => void, run: (action: () => Promise<unknown>) => Promise<boolean>) => (() => void) | RobotOfflineBattleMount;
}
export interface RobotOfflineBattleMount {
  update(battle: RobotOfflineBattle, busy: boolean): void;
  pause(paused: boolean): void;
  dispose(): void;
}
type Route = "home" | "missions" | "party" | "performance" | "rules" | "settings";
const difficultyName = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Offline-only application shell. Never imported by the shared site's registry/router. */
export async function mountRobotOfflineApp(root: HTMLElement, options: RobotOfflineAppOptions): Promise<() => void> {
  const doc = root.ownerDocument, win = doc.defaultView!, session = options.session;
  let route: Route = "home", expanded: number | null = null, missionScroll = 0, message = "", busy = false, disposed = false;
  let battleMount: RobotOfflineBattleMount | (() => void) | undefined, mountedBattleId: string | null = null, optionsOpen = false;
  let statusElement: HTMLElement | null = null;
  function disposeBattle() { if (typeof battleMount === "function") battleMount(); else battleMount?.dispose(); battleMount = undefined; mountedBattleId = null; }
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
    const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;
  }
  function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
    const b = node("button", label); b.type = "button"; b.disabled = disabled || busy; b.onclick = action; return b;
  }
  const notify = (text: string) => { message = text; render(); };
  async function run(action: () => Promise<unknown>) {
    if (busy || disposed) return false;
    busy = true; render();
    let succeeded = false;
    try { await action(); message = ""; succeeded = true; } catch (error) { message = error instanceof Error ? error.message : "処理に失敗しました。"; }
    finally { busy = false; render(); }
    return succeeded;
  }
  function navigate(next: Route) {
    if (session.state.battle) return;
    void run(async () => { if (session.state.result) await session.dismissResult(); route = next; });
  }
  function download(raw: string) {
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })), a = node("a");
    a.href = url; a.download = "robot-tactics-backup-v1.json"; a.click(); win.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file: File) {
    if (file.size > ROBOT_OFFLINE_SAVE_MAX_BYTES) throw new Error("バックアップのサイズが大きすぎます。");
    const raw = await file.text();
    let imported: RobotOfflineSave;
    try { imported = session.inspectBackup(raw); } catch { throw new Error("バックアップを読み込めません。形式・バージョン・内容を確認してください。"); }
    if (win.confirm(`現在の進行データを上書きしますか？\n読み込み後の共有EXP：${imported.progress.exp}`)) await session.importBackup(raw, true);
  }
  function start(key: RobotStageKey) {
    expanded = key.missionNumber;
    if (!session.runtime || !options.mountBattle || session.runtime.readiness(key).length) { notify("このミッションの戦闘機能は準備中です。進行データは変更していません。"); return; }
    void run(() => session.start(key));
  }
  function render() {
    if (disposed) return;
    const state = session.state;
    if (state.battle && mountedBattleId === state.battle.departure.battleId && battleMount && typeof battleMount !== "function") {
      battleMount.update(state.battle, busy); battleMount.pause(optionsOpen);
      for (const control of root.querySelectorAll<HTMLButtonElement>("header button")) control.disabled = busy;
      if (statusElement) { statusElement.textContent = message || (busy ? "保存中…" : ""); statusElement.setAttribute("role", message ? "alert" : "status"); }
      return;
    }
    disposeBattle();
    const shell = node("div", undefined, "robot-offline-shell"), header = node("header"), main = node("main");
    header.append(node("h1", "ターン制タクティクス"));
    if (!state.battle && !state.result) header.append(button(route === "home" ? "設定" : "ホーム", () => navigate(route === "home" ? "settings" : "home")));
    if (state.battle) {
      const b = state.battle;
      shell.classList.add("battle-active"); main.classList.add("robot-battle-host");
      header.append(button("オプション", () => {
        // Rendering options must pause automatic scheduling in the battle view.
        optionsOpen = true;
        if (typeof battleMount === "function") disposeBattle(); else battleMount?.pause(true);
        const dialog = node("dialog"), title = node("h2", "戦闘オプション"); dialog.append(title);
        dialog.append(button("再挑戦", () => { if (win.confirm("現在の戦闘を破棄し、出撃時の構成で再挑戦しますか？")) { optionsOpen = false; dialog.close(); void run(() => session.retry(true)); } }), button("ホーム画面に戻る", () => { if (win.confirm("ミッションを放棄しますか？戦闘状態は破棄され、報酬EXPは獲得しません。")) { optionsOpen = false; dialog.close(); route = "home"; void run(() => session.abandon(true)); } }), button("閉じる", () => dialog.close()));
        dialog.onclose = () => { optionsOpen = false; dialog.remove(); render(); }; shell.append(dialog); dialog.showModal();
      }));
      main.setAttribute("aria-label", "戦闘画面");
      if (options.mountBattle) { const target = node("div"); main.append(target); battleMount = options.mountBattle(target, b, render, run); mountedBattleId = b.departure.battleId; if (typeof battleMount !== "function") battleMount.pause(optionsOpen); }
      else main.append(node("p", "保存された戦闘を復元する機能が必要です。保存データを保持しています。"));
    } else if (state.result) {
      const result = state.result, key = result.departure.key;
      main.append(node("h2", result.result === "won" ? "勝利" : "敗北"), node("p", `M${String(key.missionNumber).padStart(2, "0")} · ${difficultyName[key.difficulty]} · R${result.endedRound}終了`), node("p", `獲得EXP ${result.expGained}`, "result-exp"));
      const unlocked = [...result.unlocked.map(id => { const [d, n] = id.split("-"); return `M${n} ${difficultyName[d as keyof typeof difficultyName]}`; }), ...result.equipmentUnlocked.map(getRobotOfflineEquipmentName)];
      main.append(node("p", unlocked.length ? `新たな解放：${unlocked.join("、")}` : "新たな解放なし"));
      const controls = node("div", undefined, "menu"); controls.append(button("もう一度プレイ", () => start(key)), button("ミッション選択へ", () => { expanded = key.missionNumber; navigate("missions"); }), button("カスタマイズへ", () => navigate("party"))); main.append(controls);
    } else if (route === "home") {
      main.append(node("h2", "ホーム"), node("p", `共有EXP ${state.progress.exp} · クリア ${state.progress.cleared.length}/90`, "muted"));
      const menu = node("nav", undefined, "menu"); menu.setAttribute("aria-label", "メインメニュー");
      for (const [label, next] of [["ミッション選択", "missions"], ["機体カスタマイズ", "party"], ["性能チェック", "performance"], ["ゲームルール", "rules"]] as const) menu.append(button(label, () => navigate(next)));
      main.append(menu, node("p", "端末内に自動保存", "muted"));
    } else if (route === "missions") {
      main.append(node("h2", "ミッション選択")); const list = node("div", undefined, "missions"); list.setAttribute("aria-label", "ミッション一覧");
      for (let n = 1; n <= 30; n++) {
        const key = { missionNumber: n, difficulty: "easy" as const }, section = node("section"), stage = getRobotStagePlan(key);
        const clears = ROBOT_DIFFICULTIES.filter(d => state.progress.cleared.includes(robotMissionId({ ...key, difficulty: d }))).map(d => difficultyName[d]);
        const b = button(`M${String(n).padStart(2, "0")} ${stage.title.replace(/^M\d+\s*/, "")} · ${clears.length ? clears.join("/") + "済" : "未クリア"}`, () => { missionScroll = main.scrollTop; expanded = expanded === n ? null : n; render(); });
        b.setAttribute("aria-expanded", String(expanded === n)); b.setAttribute("aria-controls", `mission-${n}-difficulties`); section.append(b);
        if (expanded === n) {
          const choices = node("div", undefined, "difficulty-list"); choices.id = `mission-${n}-difficulties`;
          for (const difficulty of ROBOT_DIFFICULTIES) {
            const selected = { ...key, difficulty }, row = robotMissionRow(selected), unlocked = isRobotMissionUnlocked(state.progress, selected), cleared = state.progress.cleared.includes(row.id);
            const detail = node("div"); detail.append(button(`${difficultyName[difficulty]}${unlocked ? "" : " 🔒"}`, () => { missionScroll = main.scrollTop; start(selected); }, !unlocked));
            detail.append(node("small", unlocked ? `${cleared ? "再クリア" : "初クリア"} EXP ${cleared ? row.repeatClear.exp : row.firstClear.exp}${!cleared && row.firstClear.unlock ? " · " + getRobotOfflineEquipmentName(row.firstClear.unlock.id) : ""}` : difficulty === "hard" ? "Easy全30面クリアで解放" : difficulty === "normal" ? `Easy M${String(n).padStart(2, "0")}クリアで解放` : `Easy M${String(n - 1).padStart(2, "0")}クリアで解放`)); choices.append(detail);
          }
          section.append(choices);
        }
        list.append(section);
      }
      main.append(list); win.requestAnimationFrame(() => { if (!disposed) main.scrollTop = missionScroll; });
    } else if (route === "settings") {
      main.append(node("h2", "設定・データ管理"), node("p", "バックアップはPC・スマートフォン間で移行できます。端末のデータを削除すると、バックアップなしでは復元できません。"));
      main.append(button("バックアップを書き出す", () => { try { download(session.exportBackup()); } catch { notify("バックアップを書き出せませんでした。"); } }));
      const label = node("label", "バックアップを読み込む"), input = node("input"); input.type = "file"; input.accept = ".json,application/json"; input.disabled = busy;
      input.onchange = () => { const file = input.files?.[0]; if (file) void run(() => importFile(file)); }; label.append(input); main.append(label);
    } else if (route === "party") {
      main.append(node("h2", "機体カスタマイズ"));
      const available = getRobotOfflineAvailability(state.progress);
      for (const core of state.progress.party) {
        const plan = getRobotLoadoutPlan(core, available), card = node("section", undefined, "core-card");
        card.append(node("h3", `${core.coreId} · ${core.frameId} · Lv${core.coreLevel}`), node("p", `CAP ${plan.capUsed}/${plan.capLimit}`), node("p", [plan.basic.weapon1, plan.basic.weapon2].map(p => `${getRobotOfflineEquipmentName(p.id)} Lv${p.level}`).join(" / ")));
        main.append(card);
      }
      main.append(node("p", "装備の編集・育成操作は次の実装段階で追加します。", "muted"));
    } else if (route === "performance") {
      main.append(node("h2", "性能チェック"), node("p", "実戦Coreと共通の条件選択・計算画面を次の実装段階で追加します。試算が実際の装備やEXPを変更することはありません。"));
    } else {
      main.append(node("h2", "ゲームルール"));
      for (const text of ["ミッションを選び、操作機3機と友軍AIで目標達成を目指します。", "手番はSPD順。移動先や対象をマップで選び、実行操作で確定します。", "特殊行動や連携は、ENと発動条件を確認して使用します。", "各ミッションの目標と制限ラウンドを確認してください。", "確定行動ごとに自動保存します。中断後は戦闘へ直接復帰します。", "戦闘オプションの『ホーム画面に戻る』は放棄です。戦闘の続きへ戻ることはできません。"] ) main.append(node("p", text));
    }
    const status = node("p", message || (busy ? "保存中…" : ""), "app-status"); status.setAttribute("role", message ? "alert" : "status");
    statusElement = status;
    shell.append(header, main, status); root.replaceChildren(shell);
  }
  try { await session.load(); render(); }
  catch { root.replaceChildren(node("h1", "保存データを開けませんでした"), node("p", "データは削除していません。対応する版で再起動するか、端末内保存を確認してください。")); }
  return () => { disposed = true; disposeBattle(); root.replaceChildren(); };
}
