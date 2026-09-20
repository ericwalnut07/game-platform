import type { InitialVotes, LockedRoundAction, PonVoteTarget } from "./game-state";

export type PonInaiClientAction =
  | { type: "ACK_PRIVATE_INFO" }
  | { type: "LOCK_ROUND_ACTION"; action: LockedRoundAction }
  | { type: "LOCK_INITIAL_VOTES"; votes: InitialVotes }
  | { type: "LOCK_RUNOFF_VOTE"; vote: PonVoteTarget };
