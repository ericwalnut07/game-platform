import rules from "../../../docs/design/robot-tactics/rules.json";

/** Resource ledger for one living robot; the battle scheduler owns HP and legality. */
export interface RobotEnergyState {
  readonly en: number;
  readonly maxEn: number;
  readonly round: number;
  readonly ownTurn: number;
  readonly turnOpen: boolean;
  readonly moved: boolean;
  readonly usedExtraMove: boolean;
  readonly normalHitRecovered: boolean;
  readonly killRecovered: boolean;
  readonly damagedRecovered: boolean;
  readonly action: { readonly kind: "normal-attack" | "charge" | "extra-move" | "other"; readonly energyCost: number } | null;
}

const energy = rules.combat.energy;

function nonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Expected a nonnegative safe integer");
}

export function getRobotEnergyRecoveryAmounts(maxEn: number) {
  nonnegativeInteger(maxEn);
  return {
    actionEnd: energy.recoverAtActionEnd.base + Math.floor(maxEn * energy.recoverAtActionEnd.floorMaxEnFraction),
    normalHit: energy.recoverNormalAttackHitOncePerTurn.base + Math.floor(maxEn * energy.recoverNormalAttackHitOncePerTurn.floorMaxEnFraction),
    charge: energy.chargeRecover.base + Math.floor(maxEn * energy.chargeRecover.floorMaxEnFraction)
  };
}

export function createRobotEnergyState(maxEn: number): RobotEnergyState {
  nonnegativeInteger(maxEn);
  return {
    en: Math.ceil(maxEn * energy.initialFractionCeil), maxEn, round: 1, ownTurn: 0,
    turnOpen: false, moved: false, usedExtraMove: false, normalHitRecovered: false,
    killRecovered: false, damagedRecovered: false, action: null
  };
}

/** A round boundary resets damage recovery, even when this robot has not acted. */
export function advanceRobotEnergyRound(state: RobotEnergyState): RobotEnergyState {
  if (state.turnOpen) throw new Error("Close the own turn before advancing the round");
  return { ...state, round: state.round + 1, damagedRecovered: false };
}

/** Does not reset the once-per-round damage recovery allowance. */
export function beginRobotEnergyTurn(state: RobotEnergyState): RobotEnergyState {
  if (state.turnOpen) throw new Error("Own turn is already open");
  return { ...state, ownTurn: state.ownTurn + 1, turnOpen: true, moved: false, usedExtraMove: false, normalHitRecovered: false, killRecovered: false, action: null };
}

function requireTurn(state: RobotEnergyState): void {
  if (!state.turnOpen) throw new Error("An open own turn is required");
}

function recover(state: RobotEnergyState, amount: number): RobotEnergyState {
  return { ...state, en: Math.min(state.maxEn, state.en + amount) };
}

/** Called only after a committed legal movement, never for a move preview. */
export function recordRobotEnergyMove(state: RobotEnergyState, kind: "ordinary" | "extra"): RobotEnergyState {
  requireTurn(state);
  if (kind === "ordinary") {
    if (state.moved) return state;
    if (state.action !== null) throw new Error("Ordinary movement must precede the action");
    return { ...recover(state, energy.recoverMoveOncePerTurn), moved: true };
  }
  if (kind !== "extra") throw new Error("Unsupported movement event");
  if (state.action?.kind !== "extra-move") throw new Error("Extra movement requires the extra-move action");
  return state.usedExtraMove ? state : { ...state, usedExtraMove: true };
}

/** The later action validator supplies the full adopted cost, including equipment. */
export function commitRobotEnergyAction(state: RobotEnergyState, action: NonNullable<RobotEnergyState["action"]>): RobotEnergyState {
  requireTurn(state);
  if (state.action !== null) throw new Error("Only one action per own turn");
  if (!["normal-attack", "charge", "extra-move", "other"].includes(action.kind)) throw new Error("Unsupported action kind");
  nonnegativeInteger(action.energyCost);
  if (action.energyCost > state.en) throw new Error("Insufficient EN");
  return { ...state, en: state.en - action.energyCost, action: { ...action } };
}

/** Hits/kills here are own-turn events; reaction/overwatch timing is a later layer. */
export function recordRobotEnergyCombatEvent(state: RobotEnergyState, event: "normal-hit" | "kill" | "damaged"): RobotEnergyState {
  if (event === "damaged") {
    return state.damagedRecovered ? state : { ...recover(state, energy.recoverWhenDamaged), damagedRecovered: true };
  }
  requireTurn(state);
  if (state.action === null) throw new Error("A committed action is required");
  if (event === "normal-hit") {
    if (state.action.kind !== "normal-attack" || state.action.energyCost > 0 || state.normalHitRecovered) return state;
    return { ...recover(state, getRobotEnergyRecoveryAmounts(state.maxEn).normalHit), normalHitRecovered: true };
  }
  if (event === "kill") return state.killRecovered ? state : { ...recover(state, energy.recoverOnKill), killRecovered: true };
  throw new Error("Unsupported combat event");
}

/** Once only. Equipment end-turn recovery is applied after this, by its own helper. */
export function endRobotEnergyTurn(state: RobotEnergyState): RobotEnergyState {
  requireTurn(state);
  if (state.action === null) throw new Error("A committed action is required");
  const amounts = getRobotEnergyRecoveryAmounts(state.maxEn);
  return { ...recover(state, amounts.actionEnd + (state.action.kind === "charge" ? amounts.charge : 0)), turnOpen: false };
}
