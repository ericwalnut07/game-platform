/**
 * 『表裏一体迷宮』v0.5: プレイ形式は盤面データとは独立したセッション設定。
 * 実行用Core・通信APIの実装ではなく、型契約の草案。
 */
export type LabyrinthFace = 'front' | 'back';
export type StageCategory = 'tutorial' | 'challenge';
export type LabyrinthPlayMode = 'ONLINE_DUO' | 'SOLO_PRACTICE';
export type LabyrinthStageId = `tutorial-${string}` | `challenge-${string}`;

export interface StageAvailability {
  readonly stageId: LabyrinthStageId;
  readonly supportedPlayModes: readonly LabyrinthPlayMode[];
}

/** 画面で左右に見せることと、ゲームの状態管理は別。 */
export type LabyrinthSessionConfig =
  | {
      readonly playMode: 'ONLINE_DUO';
      readonly stageId: LabyrinthStageId;
      readonly participantCount: 2;
      /** 各プレイヤーのfaceはサーバーで認証済みセッションと紐付ける。 */
      readonly seatAssignment: Readonly<Record<LabyrinthFace, string>>;
    }
  | {
      readonly playMode: 'SOLO_PRACTICE';
      readonly stageId: LabyrinthStageId;
      readonly participantCount: 1;
      /** この選択は画面状態のみ。ステージやセーブ済み盤面を書き換えない。 */
      readonly activeFace: LabyrinthFace;
    };

export interface SoloBoardPresentation {
  readonly front: { readonly side: 'left'; readonly orientation: 'own-start-bottom-goal-top' };
  readonly back: { readonly side: 'right'; readonly orientation: 'own-start-bottom-goal-top' };
  readonly bothVisible: true;
  readonly activeFace: LabyrinthFace;
  readonly independentBoardViewports: true;
}

export type LabyrinthActorContext =
  | { readonly playMode: 'ONLINE_DUO'; readonly authenticatedPlayerId: string; readonly serverSeatAssignment: Readonly<Record<LabyrinthFace, string>> }
  | { readonly playMode: 'SOLO_PRACTICE'; readonly selectedFace: LabyrinthFace };

/** オンラインではクライアントのactor/faceフィールドを採用しない。 */
export function resolveActionFace(context: LabyrinthActorContext): LabyrinthFace {
  if (context.playMode === 'SOLO_PRACTICE') return context.selectedFace;
  if (context.serverSeatAssignment.front === context.authenticatedPlayerId) return 'front';
  if (context.serverSeatAssignment.back === context.authenticatedPlayerId) return 'back';
  throw new Error('Unauthorized labyrinth actor');
}
