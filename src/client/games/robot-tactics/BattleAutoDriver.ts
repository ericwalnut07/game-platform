import { ROBOT_BATTLE_PRESENTATION_MS } from "./BattleEffects";
import { robotBattleCheckpointKey, type RobotBattleViewModel } from "./BattleViewModel";

export interface RobotBattleClock { set(callback: () => void, ms: number): unknown; clear(id: unknown): void }
/** Follows the Core's current actor; no speed sorting or AI decision rule lives here. */
export class RobotBattleAutoDriver {
  private model: RobotBattleViewModel | null = null;
  private paused = false; private busy = false; private disposed = false; private running = false; private failed = false;
  private approved: string | null = null; private timer: unknown; private generation = 0;
  private lastSubmittedKey: string | null = null;
  constructor(private readonly clock: RobotBattleClock, private readonly execute: (checkpoint: RobotBattleViewModel["checkpoint"]) => Promise<void>, private readonly error: (error: unknown) => void) {}
  update(model: RobotBattleViewModel, busy: boolean): void { if (this.model && robotBattleCheckpointKey(this.model) !== robotBattleCheckpointKey(model)) this.failed = false; if (this.model?.ai.mode !== model.ai.mode) this.approved = null; this.model = model; this.busy = busy; this.schedule(); }
  pause(paused: boolean): void { this.paused = paused; this.schedule(); }
  approveFriendly(): void {
    if (this.model?.queue[0]?.kind !== "friendly-ai" || this.model.ai.mode !== "manual") throw new Error("Only a manual friendly turn accepts approval");
    this.approved = this.model.checkpoint.battleId + ":" + this.model.turnId; this.failed = false; this.schedule();
  }
  retry(): void { this.failed = false; this.lastSubmittedKey = null; this.schedule(); }
  private cancel(): void { this.generation++; if (this.timer !== undefined) this.clock.clear(this.timer); this.timer = undefined; }
  private schedule(): void {
    this.cancel(); const model = this.model, actor = model?.queue[0];
    if (!model || !actor || actor.kind === "controlled" || this.paused || this.busy || this.disposed || this.running || this.failed) return;
    if (this.lastSubmittedKey === robotBattleCheckpointKey(model)) return;
    if (actor.kind === "friendly-ai" && model.ai.mode === "manual" && this.approved !== model.checkpoint.battleId + ":" + model.turnId) return;
    const generation = this.generation;
    this.timer = this.clock.set(() => {
      this.timer = undefined;
      if (generation !== this.generation || this.paused || this.disposed || this.busy || this.running) return;
      this.running = true;
      this.lastSubmittedKey = robotBattleCheckpointKey(model);
      void this.execute(model.checkpoint).catch(error => { this.failed = true; this.error(error); }).finally(() => { this.running = false; this.schedule(); });
    }, ROBOT_BATTLE_PRESENTATION_MS);
  }
  dispose(): void { this.disposed = true; this.cancel(); }
}
