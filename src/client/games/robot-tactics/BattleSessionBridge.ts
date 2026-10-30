import type { RobotJson, RobotOfflineBattle, RobotOfflineDeparture, RobotOfflineSession } from "../../../games/robot-tactics/offlineSession";
import { mountRobotBattleScreen, type RobotBattleScreenOptions } from "./BattleScreen";
import { assertRobotBattleViewModel, type RobotBattleViewModel } from "./BattleViewModel";
import type { RobotOfflineAppOptions } from "./OfflineApp";

export interface RobotBattleSessionAdapter {
  project(battle: RobotOfflineBattle): RobotBattleViewModel;
  /** Same trusted algorithm in automatic and manual-instruction modes. */
  chooseAiAction(snapshot: RobotJson, departure: RobotOfflineDeparture): RobotJson;
  readonly renderEffect?: RobotBattleScreenOptions["renderEffect"];
}

/** Connects durable session checkpoints to the reusable UI without inventing combat rules. */
export function createRobotBattleMount(session: RobotOfflineSession, adapter: RobotBattleSessionAdapter): NonNullable<RobotOfflineAppOptions["mountBattle"]> {
  const project = (battle: RobotOfflineBattle) => {
    const model = adapter.project(battle); assertRobotBattleViewModel(model);
    if (model.checkpoint.battleId !== battle.departure.battleId || model.checkpoint.sequence !== battle.sequence) throw new Error("Battle projection checkpoint mismatch");
    return model;
  };
  const current = (checkpoint: RobotBattleViewModel["checkpoint"]) => {
    const battle = session.state.battle;
    if (!battle || battle.departure.battleId !== checkpoint.battleId || battle.sequence !== checkpoint.sequence) throw new Error("Stale battle screen action");
    return { battle, model: project(battle) };
  };
  return (root, battle, _changed, run) => {
    const invoke = async (operation: () => Promise<unknown>) => {
      if (!await run(operation)) throw new Error("自動保存を完了できませんでした。保存状態を確認して再試行してください。");
    };
    const screen = mountRobotBattleScreen(root, {
      model: project(battle), ...(adapter.renderEffect ? { renderEffect: adapter.renderEffect } : {}),
      execute: async (choiceId, checkpoint) => {
        const { model } = current(checkpoint), choice = model.choices.find(c => c.id === choiceId);
        if (model.queue[0]?.kind !== "controlled" || !choice) throw new Error("Illegal or stale player selection");
        await invoke(() => session.act({ battleId: checkpoint.battleId, expectedSequence: checkpoint.sequence, actionId: crypto.randomUUID(), action: choice.payload }));
      },
      executeAi: async checkpoint => {
        const { battle, model } = current(checkpoint);
        if (!model.queue[0] || model.queue[0].kind === "controlled") throw new Error("Not an AI turn");
        const action = adapter.chooseAiAction(battle.snapshot, battle.departure);
        await invoke(() => session.act({ battleId: checkpoint.battleId, expectedSequence: checkpoint.sequence, actionId: crypto.randomUUID(), action }));
      },
      configureAi: async (change, checkpoint) => {
        current(checkpoint);
        await invoke(() => session.configureAi({ battleId: checkpoint.battleId, expectedSequence: checkpoint.sequence, configurationId: crypto.randomUUID(), change }));
      }
    });
    return { update: (next, busy) => screen.update(project(next), busy), pause: paused => screen.pause(paused), dispose: () => screen.dispose() };
  };
}
