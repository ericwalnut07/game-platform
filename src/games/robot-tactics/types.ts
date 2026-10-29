/**
 * Robot tactics stage *planning* data. This is not a combat engine and must not
 * be registered as a launchable solo game until the game identity/rules are final.
 */
export type RobotDifficulty = "easy" | "normal" | "hard";
export type RobotCell = string;
export type RobotModel = "A" | "B" | "C" | "boss-pending";
export type StageApproval = "adopted-layout" | "unadopted-candidate";

export interface RobotStageKey {
  readonly missionNumber: number;
  readonly difficulty: RobotDifficulty;
}

export interface RobotStageUnit {
  readonly id: string;
  readonly kind: "light-squad" | "medium" | "heavy" | "boss";
  readonly cells: readonly RobotCell[];
  readonly chassisOrArchetype: string;
  readonly model: RobotModel | null;
  readonly enemyCoreLevel: number | null;
  readonly weaponLevel: number | null;
}

export interface RobotStageWave {
  readonly id: string;
  readonly triggerType: string;
  readonly triggerRound: number | null;
  readonly initialCells: readonly RobotCell[];
  readonly fallbackCells: readonly RobotCell[];
  /** M04 wave chooses one of two branches AFTER the first depot falls. */
  readonly spawnBranches: readonly {
    readonly survivingDepotId: string;
    readonly memberCells: readonly RobotCell[];
    readonly fallbackCells: readonly RobotCell[];
  }[];
  readonly squad: RobotStageUnit;
}

export interface RobotStageObjectivePlan {
  readonly kind: string;
  readonly conditionKinds: readonly string[];
  /** Read-only raw design data for a later, separately approved rules adapter. */
  readonly specification: Readonly<Record<string, unknown>>;
}

export interface RobotStagePlan {
  readonly key: RobotStageKey;
  readonly title: string;
  readonly designStatus: StageApproval;
  readonly sourcePath: string;
  readonly roundLimit: number;
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotCell[] };
  readonly players: readonly RobotCell[];
  readonly friendlyAI: readonly { readonly cell: RobotCell; readonly preset: string }[];
  readonly respawnPriority: readonly RobotCell[];
  readonly initialEnemies: readonly RobotStageUnit[];
  readonly reinforcements: readonly RobotStageWave[];
  readonly objective: RobotStageObjectivePlan;
  readonly recommendedCoreLevel: { readonly min: number; readonly max: number };
  readonly firstClear: { readonly exp: number; readonly unlock: { readonly type: string; readonly id: string } | null };
  readonly referenceEnemyCoreLevel: number | null;
  readonly enemyWeaponLevel: number | null;
  /**
   * Non-empty means this stage cannot be promoted into a production battle.
   * Unapproved conditions, missing numbers and missing difficulty values fail closed.
   */
  readonly blockingIssues: readonly string[];
  readonly isReadyForFormalPlay: boolean;
}
