import { getRobotFormationOptions } from "../../../games/robot-tactics/formations";
import { getRobotDelayedFuseOptions } from "../../../games/robot-tactics/delayedFuse";
import { getRobotBattleBlastOptions } from "../../../games/robot-tactics/battleBlast";
import { getRobotActiveCombatOptions } from "../../../games/robot-tactics/activeCombat";
import { getRobotDeltaOptions, getRobotExtraMoveOptions, getRobotSupportTargets, getRobotAddonStrikeOptions } from "../../../games/robot-tactics/commonCombat";
import basicParts from "../../../../docs/design/robot-tactics/basic-parts.json";
import { projectRobotBattleCore } from "./BattleCoreView";
import { emptyRobotBattleSelection, type RobotBattleChoice, type RobotBattleCommand } from "./BattleViewModel";
import type { RobotBattleSessionAdapter } from "./BattleSessionBridge";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleLegalMoves, getRobotBattleUnit, robotBattleTurnId } from "../../../games/robot-tactics/battleState";
import { getRobotBattleBurstOptions, getRobotBattleNormalAttackOptions, getRobotBattleSpreadOptions, getRobotBattleSweepOptions, commitRobotBattleWeaponCombo } from "../../../games/robot-tactics/battleWeaponActions";
import { resolveRobotBasicPart } from "../../../games/robot-tactics/equipment";
import { getRobotShieldActionPlan } from "../../../games/robot-tactics/equipmentEffects";
import { getRobotWeaponComboPlan } from "../../../games/robot-tactics/weaponActions";
import { getRobotInitiativeQueue } from "../../../games/robot-tactics/initiative";

/** Production view adapter. Legal commands come from the same Core resolvers
 * used by runtime.act; no test roster, fixed turn or fabricated damage values.
 */
export const robotFormalBattleAdapter: RobotBattleSessionAdapter = {
  chooseAiAction: () => ({ kind: "npc" }),
  project: battle => {
    const s = decodeRobotBattleCore(battle.snapshot), actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
    const commands: RobotBattleCommand[] = [], choices: RobotBattleChoice[] = [];
    const add = (command: RobotBattleCommand, supplied: readonly RobotBattleChoice[]) => { commands.push(command); choices.push(...supplied); };
    const selection = (targetIds: readonly string[] = []) => ({ ...emptyRobotBattleSelection(), targetIds });
    if (source.kind === "controlled") {
      const moves = getRobotBattleLegalMoves(s, source.id);
      add({ id: "move", label: "通常移動", category: "move", disabledReason: source.energy.moved ? "移動済み" : moves.length ? null : "合法な移動先がありません" }, moves.map((m, i) => ({ id: "move:" + i, commandId: "move", selection: { ...selection(), destination: m.destination }, payload: { kind: "move", destination: { ...m.destination } } })));
      const weapons = source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon");
      for (const weapon of weapons) {
        if (source.addons?.some(a => a.partId === "delayed-fuse")) {
          const options = getRobotDelayedFuseOptions(s, weapon.partId), id = "delayed-fuse:" + weapon.partId;
          add({ id, label: `遅延起爆信管（EN${options.energyCost}）`, category: "special", disabledReason: options.disabledReason }, options.targetIds.map(targetId => ({ id: id + ":" + targetId, commandId: id, selection: selection([targetId]), payload: { kind: "delayed-fuse", weaponId: weapon.partId, targetId } })));
        }
        const part = resolveRobotBasicPart(weapon.partId, weapon.level), normal = getRobotBattleNormalAttackOptions(s, weapon.partId), id = "normal:" + weapon.partId;
        add({ id, label: `${basicParts.parts.find(p => p.id === part.id)!.name}・通常（EN${normal.energyCost}）`, category: "attack", disabledReason: normal.disabledReason }, normal.targetIds.map(targetId => ({ id: id + ":" + targetId, commandId: id, selection: selection([targetId]), payload: { kind: "normal", weaponId: weapon.partId, targetId } })));
        if (part.weaponFamily === "slash") {
          const sweep = getRobotBattleSweepOptions(s, weapon.partId), id = "sweep:" + weapon.partId;
          add({ id, label: "薙ぎ払い（EN" + sweep.plan.energyCost + "）", category: "attack", disabledReason: sweep.disabledReason ?? (source.energy.en < sweep.plan.energyCost ? "EN不足" : sweep.targetSets.length ? null : "合法な対象がいません") }, sweep.targetSets.map((targetIds, i) => ({ id: id + ":" + i, commandId: id, selection: selection(targetIds), payload: { kind: "sweep", weaponId: weapon.partId, targetIds: [...targetIds] } })));
        }
        if (part.weaponFamily === "blast") {
          const advanced = source.addons?.some(a => ["empty-tile-targeting", "blast-target-expander", "double-detonation-control"].includes(a.partId));
          if (advanced) {
            for (const mode of ["burst", "double"] as const) {
              if (mode === "double" && !source.addons?.some(a => a.partId === "double-detonation-control")) continue;
              const id = mode + ":" + weapon.partId;
              try {
                const blast = getRobotBattleBlastOptions(s, weapon.partId, mode);
                add({ id, label: `${mode === "double" ? "二点起爆" : "爆撃攻撃"}（EN${blast.plan.baseEnergyCost}${blast.plan.expansionEnergyCost ? "/拡張時+" + blast.plan.expansionEnergyCost : ""}）`, category: mode === "double" ? "special" : "attack", targetFlow: "blast", confirmLabel: "決定", disabledReason: blast.disabledReason, blast: { ...blast, weaponId: weapon.partId } }, []);
              } catch (e) { add({ id, label: "二点起爆", category: "special", disabledReason: (e as Error).message }, []); }
            }
          } else {
          const burst = getRobotBattleBurstOptions(s, weapon.partId), id = "burst:" + weapon.partId;
          add({ id, label: "爆撃攻撃", category: "attack", targetFlow: "blast", confirmLabel: "決定", disabledReason: burst.disabledReason }, burst.centers.flatMap(c => c.neighborSets.map((neighborIds, i) => ({ id: id + ":" + c.centerId + ":" + i, commandId: id, centerTargetId: c.centerId, areaCells: c.areaCells, selection: selection([c.centerId, ...neighborIds]), payload: { kind: "burst", weaponId: weapon.partId, centerId: c.centerId, neighborIds: [...neighborIds] } }))));
          }
        }
      }
      const extra = getRobotExtraMoveOptions(s);
      add({ id: "extra-move", label: `追加移動（EN${extra.energyCost}）`, category: "special", disabledReason: extra.disabledReason }, extra.moves.map((m, i) => ({ id: "extra-move:" + i, commandId: "extra-move", selection: { ...selection(), destination: m.destination }, payload: { kind: "extra-move", destination: { ...m.destination } } })));
      for (const weapon of weapons) {
        let delta: ReturnType<typeof getRobotDeltaOptions>;
        try { delta = getRobotDeltaOptions(s, weapon.partId); } catch (e) { delta = { energyCost: 75, targetIds: [], participantSets: [], disabledReason: (e as Error).message }; }
        const id = "delta:" + weapon.partId, subsets: string[][] = [];
        for (let a = 0; a < delta.targetIds.length; a++) {
          subsets.push([delta.targetIds[a]!]);
          for (let b = a + 1; b < delta.targetIds.length; b++) {
            subsets.push([delta.targetIds[a]!, delta.targetIds[b]!]);
            for (let c = b + 1; c < delta.targetIds.length; c++) subsets.push([delta.targetIds[a]!, delta.targetIds[b]!, delta.targetIds[c]!]);
          }
        }
        add({ id, label: `デルタ（EN${delta.energyCost}）`, category: "formation", disabledReason: delta.disabledReason }, delta.participantSets.flatMap((participantIds, i) => subsets.map((targetIds, j) => ({ id: id + ":" + i + ":" + j, commandId: id, selection: { ...selection(targetIds), participantIds }, payload: { kind: "delta", weaponId: weapon.partId, participantIds, targetIds } }))));
        if (source.addons?.some(a => a.partId === "en-supply-round")) {
          const support = getRobotSupportTargets(s, "en-supply", weapon.partId), id = "en-supply:" + weapon.partId;
          add({ id, label: `EN供給（EN${support.energyCost}）`, category: "special", disabledReason: support.disabledReason }, support.targetIds.map(targetId => ({ id: id + ":" + targetId, commandId: id, selection: selection([targetId]), payload: { kind: "en-supply", weaponId: weapon.partId, targetId } })));
        }
        for (const [kind, addon, label] of [["close-sniper", "close-range-sniper", "近接狙撃"], ["blade-vault", "blade-vault", "刃渡り"]] as const) if (source.addons?.some(a => a.partId === addon)) {
          const options = getRobotAddonStrikeOptions(s, kind, weapon.partId), id = kind + ":" + weapon.partId;
          add({ id, label: `${label}（EN${options.energyCost}）`, category: "special", disabledReason: options.disabledReason }, options.targets.map(t => ({ id: id + ":" + t.targetId, commandId: id, selection: selection([t.targetId]), payload: { kind, weaponId: weapon.partId, targetId: t.targetId } })));
        }
      }
      for (const weapon of weapons) {
        for (const [kind, label] of [["line", "ライン"], ["pair-defense", "ペア"], ["pincer", "挟撃"], ["protection", "防護陣"]] as const) {
          const options = getRobotFormationOptions(s, kind, weapon.partId), id = kind + ":" + weapon.partId;
          add({ id, label: `${label}（EN${options.energyCost}）`, category: "formation", disabledReason: options.disabledReason }, options.selections.map((c, i) => ({ id: id + ":" + i, commandId: id, selection: { ...selection(c.targetIds), participantIds: c.participantIds }, payload: { kind, weaponId: weapon.partId, participantIds: c.participantIds, targetIds: c.targetIds } })));
        }
        for (const [kind, label] of [["overwatch", "迎撃態勢"], ["charge-strike", "特攻"], ["super-charge", "超特攻"], ["burning-round", "継続燃焼弾"], ["hp-heal", "HP回復弾"], ["pull-strike", "引戻し槍撃"], ["epicenter-echo", "震央反響"]] as const) {
          const options = getRobotActiveCombatOptions(s, kind, weapon.partId), id = kind + ":" + weapon.partId;
          let targets = options.targetIds.map(id => [id]);
          let area: ReturnType<typeof getRobotBattleBurstOptions> | null = null;
          if (kind === "burning-round" && resolveRobotBasicPart(weapon.partId, weapon.level).weaponFamily === "blast" && !options.disabledReason) { area = getRobotBattleBurstOptions(s, weapon.partId); targets = area.centers.flatMap(c => c.neighborSets.map(set => [c.centerId, ...set])); }
          add({ id, label: `${label}（EN${options.energyCost}）`, category: "special", disabledReason: options.disabledReason, ...(area ? { targetFlow: "blast" as const, confirmLabel: "決定" } : {}) }, options.disabledReason ? [] : kind === "overwatch" ? [{ id, commandId: id, selection: selection(), payload: { kind, weaponId: weapon.partId, targetIds: [] } }] : targets.map((targetIds, i) => ({ id: id + ":" + i, commandId: id, ...(area ? { centerTargetId: targetIds[0]!, areaCells: area.centers.find(c => c.centerId === targetIds[0])!.areaCells } : {}), selection: selection(targetIds), payload: { kind, weaponId: weapon.partId, targetIds } })));
        }
      }
      if (source.addons?.some(a => a.partId === "self-repair-unit")) { const options = getRobotActiveCombatOptions(s, "self-heal"); add({ id: "self-heal", label: `自己修復（EN${options.energyCost}）`, category: "special", disabledReason: options.disabledReason }, options.targetIds.map(targetId => ({ id: "self-heal:" + targetId, commandId: "self-heal", selection: selection([targetId]), payload: { kind: "self-heal", targetIds: [targetId] } }))); }
      if (source.addons?.some(a => a.partId === "status-repair")) {
        const support = getRobotSupportTargets(s, "cleanse");
        add({ id: "cleanse", label: `状態修復（EN${support.energyCost}）`, category: "special", disabledReason: support.disabledReason }, support.targetIds.map(targetId => ({ id: "cleanse:" + targetId, commandId: "cleanse", selection: selection([targetId]), payload: { kind: "cleanse", targetId } })));
      }
      const primary = weapons[0]!, secondary = weapons[1]!, combo = getRobotWeaponComboPlan(primary, secondary), comboChoices: RobotBattleChoice[] = [];
      if (combo.kind === "ranged-ranged") {
        const spread = getRobotBattleSpreadOptions(s, primary.partId, secondary.partId);
        add({ id: "combo", label: "拡散射撃（EN50）", category: "special", immediateTargetTap: true, disabledReason: spread.disabledReason }, spread.centers.map(c => ({ id: "combo:" + c.centerId, commandId: "combo", selection: selection([c.centerId]), payload: { kind: "combo", primaryWeaponId: primary.partId, secondaryWeaponId: secondary.partId, targetIds: [c.centerId] } })));
      } else {
        // Pure Core dry runs validate all combo-specific ranges, distinct-target
        // geometry and EN. Nothing is published, saved or applied to s here.
        const enemies = s.units.filter(u => u.hp > 0 && u.kind !== "controlled" && u.kind !== "friendly-ai").map(u => u.id);
        const targetSets = combo.kind === "slash-ranged" ? enemies.flatMap(a => enemies.filter(b => b !== a).map(b => [a, b])) : enemies.map(id => [id]);
        if (source.energy.en >= combo.energyCost) for (const targetIds of targetSets) {
          try { commitRobotBattleWeaponCombo(s, { actionId: s.id + ":preview", turnId: robotBattleTurnId(s), primaryWeaponId: primary.partId, secondaryWeaponId: secondary.partId, targetIds }); }
          catch { continue; }
          comboChoices.push({ id: "combo:" + targetIds.join(":"), commandId: "combo", ...(combo.kind === "slash-ranged" ? { orderedTargets: true as const } : {}), selection: selection(targetIds), payload: { kind: "combo", primaryWeaponId: primary.partId, secondaryWeaponId: secondary.partId, targetIds } });
        }
        add({ id: "combo", label: `${combo.kind === "slash-ranged" ? "双対象攻撃（斬撃→射撃）" : "武装コンボ"}（EN${combo.energyCost}）`, category: "special", disabledReason: source.energy.en < combo.energyCost ? "EN不足" : comboChoices.length ? null : "合法な対象がいません" }, comboChoices);
      }
      const shield = getRobotShieldActionPlan(source.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), source.addons ?? []);
      for (const [kind, label, cost] of [["defend", "防御", 0], ["shield", "シールド", shield.energyCost], ["charge", "チャージ", 0], ["wait", "待機", 0]] as const) add({ id: kind, label: `${label}${cost ? `（EN${cost}）` : ""}`, category: kind === "wait" ? "wait" : "special", disabledReason: source.energy.en < cost ? "EN不足" : null }, source.energy.en < cost ? [] : [{ id: kind, commandId: kind, selection: selection(), payload: { kind } }]);
    }
    return projectRobotBattleCore(s, { battleId: battle.departure.battleId, sequence: battle.sequence }, { commands, choices, previewActorIds: getRobotInitiativeQueue(s).filter(id => id !== actor.id) });
  }
};
