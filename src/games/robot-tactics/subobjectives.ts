import spec from "../../../docs/design/robot-tactics/all-90-subobjectives-final-2026-11-07.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import { resolveRobotBasicPart, type RobotLoadout } from "./equipment";
import { getRobotBattleResult, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import { robotEarlyGoalCells } from "./earlyMissions";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotStageKey } from "./types";

const conditions = new Map(spec.conditions.map(row => [row.id, row]));
const conditionFor = ({ missionNumber, difficulty }: RobotStageKey) =>
  conditions.get(difficulty + "-" + String(missionNumber).padStart(2, "0"));

/** Ordered, committed facts supplied by a stage. Damage is actual HP removed;
 * a lethal receipt identifies the source that removed the final HP. */
export type RobotSubobjectiveEvent =
  | { kind: "damage"; sourceId: string; source: "controlled" | "friendly-ai" | "enemy"; targetId: string; target: "enemy" | "depot"; hpRemoved: number; lethal: boolean; technique?: string; waveId?: string }
  | { kind: "cross" | "defeat"; controlledId: string }
  | { kind: "pickup" | "upload" }
  | { kind: "carrier-pair"; controlledId: string }
  | { kind: "round-end"; round: number; bases: readonly RobotSubobjectiveBase[]; guardedIds: readonly string[]; transportAdvance: number };

interface RobotSubobjectiveBase {
  cell: string;
  allied: boolean;
  controlledId?: string;
}

export interface RobotSubobjectiveEvidence {
  result: "won" | "lost" | "ongoing";
  round: number;
  sortieEligible?: boolean;
  facility?: { hp: number; maxHp: number };
  transport?: { hp: number; maxHp: number };
  /** The round ends that actually establish the main objective's winning streak. */
  winningRoundEnds?: readonly Extract<RobotSubobjectiveEvent, { kind: "round-end" }>[];
  winningCrossers?: readonly string[];
  livingEnemyIds?: readonly string[];
  controlledSurvivors?: number;
  dataSentWithoutDrop?: boolean;
  early?: {
    preCrossDamageIds?: readonly string[];
    depotDamageSources: Readonly<Record<string, readonly string[]>>;
    depotFinalBlows?: Readonly<Record<string, string>>;
    centralBaseOccupied: boolean;
    lastTransportGuardRound?: number | null;
  };
  events?: readonly RobotSubobjectiveEvent[];
}

type Slot = "weapon1" | "weapon2";
type Rule = {
  kind: string;
  slots?: readonly Slot[];
  weaponSlots?: readonly Slot[];
  families?: readonly string[];
  frameGroups?: readonly string[];
  frameGroup?: string;
  weaponFamily?: string;
  weaponFamilies?: readonly string[];
  requiredFamilies?: readonly string[];
  meleeFamilies?: readonly string[];
  rangedFamilies?: readonly string[];
  minDistinctMeleeFamilies?: number;
  minDistinctRangedFamilies?: number;
  minimum?: number;
  minEach?: number;
  minDistinctFamilies?: number;
  minDistinctControlledUnits?: number;
  target?: "facility" | "transport";
  minRatio?: number;
  lastWinningRound?: number;
  depotIds?: readonly string[];
  fromRound?: number;
  minRound?: number;
  minAlliedControlledBases?: number;
  minDirectlyControlledOccupiedBases?: number;
  allowedTechniqueIds?: readonly string[];
  reinforcementId?: string;
  targetId?: string;
  bossId?: string;
  heavyUnitId?: string;
  minDistinctControlledUnitIds?: number;
  minAlliedOwnedBases?: number;
  structureId?: string;
  transportAdvanceRequired?: number;
  minControlledSurvivors?: number;
};

function ruleFor(key: RobotStageKey): Rule | undefined {
  return conditionFor(key)?.rule as Rule | undefined;
}

const frameFamilies = new Map(frames.frames.map(frame => [frame.id, frame.groupId.split("-")[0]!]));
const isSortieRule = (rule: Rule) => rule.kind.startsWith("sortie-") ||
  rule.kind === "three-distinct-first-weapon-families" || rule.kind === "first-weapon-ranged-on-two-controlled";
const bothSlots: readonly Slot[] = ["weapon1", "weapon2"];

/** Freeze the equipment predicate from the three equipped sortie loadouts. */
export function getRobotSortieSubobjective(missionNumber: number, party: readonly RobotLoadout[]): boolean {
  if (party.length !== 3) return false;
  const rule = ruleFor({ missionNumber, difficulty: "easy" });
  if (!rule || !isSortieRule(rule)) return false;
  const equipped = party.map(unit => ({
    frame: frameFamilies.get(unit.frameId),
    weapons: Object.fromEntries(bothSlots.map(slot => {
      const part = unit.basic[slot];
      return [slot, resolveRobotBasicPart(part.partId, part.level).weaponFamily];
    })) as Record<Slot, string | null>,
  }));
  const groupCount = (group: string) => equipped.filter(unit => unit.frame === group).length;
  const slots = rule.slots ?? rule.weaponSlots ?? bothSlots;
  const families = new Set(equipped.flatMap(unit => slots.map(slot => unit.weapons[slot])).filter(f => f !== null));
  const first = equipped.map(unit => unit.weapons.weapon1);
  const allFamilies = (required: readonly string[]) => required.every(f => families.has(f));
  switch (rule.kind) {
    case "sortie-weapon-family-set": return allFamilies(rule.families!);
    case "sortie-frame-group-set": return rule.frameGroups!.every(group => groupCount(group) >= rule.minEach!);
    case "three-distinct-first-weapon-families": return first.every(f => f !== null) && new Set(first).size >= rule.minDistinctFamilies!;
    case "first-weapon-ranged-on-two-controlled": return first.filter(f => f !== null && rule.weaponFamilies!.includes(f)).length >= rule.minDistinctControlledUnits!;
    case "sortie-at-least-distinct-weapon-families": return families.size >= rule.minimum!;
    case "sortie-frame-and-weapon": return groupCount(rule.frameGroup!) > 0 && families.has(rule.weaponFamily!);
    case "sortie-each-first-weapon-melee-family": return rule.requiredFamilies!.every(f => first.includes(f));
    case "sortie-same-unit-frame-and-weapon":
      return equipped.some(unit => unit.frame === rule.frameGroup && slots.some(slot => unit.weapons[slot] === rule.weaponFamily));
    case "sortie-one-unit-melee-and-ranged-weapons":
      return equipped.some(unit => slots.some(slot => rule.meleeFamilies!.includes(unit.weapons[slot] ?? "")) && slots.some(slot => rule.rangedFamilies!.includes(unit.weapons[slot] ?? "")));
    case "sortie-frame-and-family-set": return rule.frameGroups!.every(group => groupCount(group) > 0) && allFamilies(rule.weaponFamilies!);
    case "sortie-min-distinct-melee-and-ranged-weapon-families":
      return rule.meleeFamilies!.filter(f => families.has(f)).length >= rule.minDistinctMeleeFamilies! &&
        rule.rangedFamilies!.filter(f => families.has(f)).length >= rule.minDistinctRangedFamilies!;
    default: return false;
  }
}

const earlyDepotIds = ["depot-left", "depot-right"];
function stageDepotIds(key: RobotStageKey): readonly string[] {
  const objective = getRobotStagePlan(key).objective.specification;
  return (objective.depots as readonly { id: string }[]).map(depot => depot.id);
}

function transportId(key: RobotStageKey): string {
  const objective = getRobotStagePlan(key).objective.specification;
  const escort = (objective.conditions as readonly { kind: string; transport?: { id: string } }[])
    .find(condition => condition.kind === "escort-transport");
  return escort!.transport!.id;
}
type Damage = Extract<RobotSubobjectiveEvent, { kind: "damage" }>;
type RoundEnd = Extract<RobotSubobjectiveEvent, { kind: "round-end" }>;

export function evaluateRobotSubobjective(key: RobotStageKey, evidence: RobotSubobjectiveEvidence): boolean {
  if (evidence.result !== "won") return false;
  const rule = ruleFor(key);
  if (!rule) return false;
  if (isSortieRule(rule)) {
    return evidence.sortieEligible === true;
  }

  const events = evidence.events ?? [];
  const damage = events.filter((event): event is Damage => event.kind === "damage" && event.hpRemoved > 0);
  const controlledDamage = damage.filter(event => event.source === "controlled");
  const depotHits = controlledDamage.filter(event => event.target === "depot");
  const rounds = events.filter((event): event is RoundEnd => event.kind === "round-end");
  const firstPickup = events.findIndex(event => event.kind === "pickup");
  const upload = events.findIndex(event => event.kind === "upload");
  const duringCarry = upload > firstPickup && firstPickup >= 0 ? events.slice(firstPickup + 1, upload) : [];
  const latest = evidence.winningRoundEnds?.at(-1);
  const lastWinningRound = latest?.round === evidence.round ? latest : undefined;
  const controlledAtVictory = lastWinningRound?.bases.flatMap(base => base.allied && base.controlledId ? [base.controlledId] : []) ?? [];
  const early = evidence.early;

  switch (rule.kind) {
    case "objective-remaining-hp-ratio": {
      const object = rule.target === "facility" ? evidence.facility : evidence.transport;
      return !!object && object.maxHp > 0 && object.hp >= Math.ceil(object.maxHp * rule.minRatio!);
    }
    case "victory-by-round": return evidence.round <= rule.lastWinningRound!;
    case "breakthrough-participant-damages-before-cross":
      return evidence.winningCrossers?.slice(0, 2).some(id => early?.preCrossDamageIds?.includes(id)) ?? false;
    case "two-depots-hit-by-distinct-controlled": {
      const [left, right] = rule.depotIds!;
      return early?.depotDamageSources[left!]?.some(id => early.depotDamageSources[right!]?.some(other => id !== other)) ?? false;
    }
    case "both-depots-hit-and-one-directly-killed":
      return earlyDepotIds.every(id => !!early?.depotDamageSources[id]?.length) && earlyDepotIds.some(id => !!early?.depotFinalBlows?.[id]);
    case "controlled-guard-transport-at-round-end":
      return key.missionNumber === 5 ? (early?.lastTransportGuardRound ?? 0) >= rule.fromRound! :
        rounds.some(event => event.round >= (rule.fromRound ?? 1) && event.guardedIds.includes(transportId(key)));
    case "controlled-central-base-at-round-end": return early?.centralBaseOccupied === true;
    case "controlled-participant-in-winning-bases":
      return (lastWinningRound?.bases.filter(base => base.allied).length ?? 0) >= rule.minAlliedControlledBases! &&
        controlledAtVictory.length >= rule.minDirectlyControlledOccupiedBases!;
    case "data-transmitted-without-drop": return evidence.dataSentWithoutDrop === true;
    case "offensive-formation-positive-enemy-hp-damage":
      return damage.some(event => event.source !== "enemy" && event.target === "enemy" && rule.allowedTechniqueIds!.includes(event.technique ?? ""));
    case "first-breakthrough-actor-never-defeated": {
      const first = events.find(event => event.kind === "cross");
      return first?.kind === "cross" && !events.some(event => event.kind === "defeat" && event.controlledId === first.controlledId);
    }
    case "two-depots-different-controlled-final-blows": {
      const [left, right] = stageDepotIds(key).map(id => depotHits.find(hit => hit.targetId === id && hit.lethal)?.sourceId);
      return !!left && !!right && left !== right;
    }
    case "two-distinct-controlled-own-bases-at-victory":
      return new Set(controlledAtVictory).size >= rule.minDistinctControlledUnitIds!;
    case "data-pursuit-reinforcement-controlled-kill-before-upload":
      return duringCarry.some(event => event.kind === "damage" && event.source === "controlled" && event.target === "enemy" && event.hpRemoved > 0 && event.lethal && event.waveId === rule.reinforcementId);
    case "specific-heavy-unit-controlled-kill":
      return controlledDamage.some(event => event.target === "enemy" && event.targetId === rule.targetId && event.lethal);
    case "boss-hit-by-two-distinct-controlled":
      return new Set(controlledDamage.filter(event => event.target === "enemy" && event.targetId === rule.bossId).map(event => event.sourceId)).size >= rule.minDistinctControlledUnitIds!;
    case "defeat-free-heavy-bypass": return evidence.livingEnemyIds?.includes(rule.heavyUnitId!) ?? false;
    case "both-depots-hit-before-first-destruction": {
      const firstDestroyed = events.findIndex(event => event.kind === "damage" && event.target === "depot" && event.hpRemoved > 0 && event.lethal);
      return firstDestroyed >= 0 && stageDepotIds(key).every(id => events.slice(0, firstDestroyed).some(event =>
        event.kind === "damage" && event.target === "depot" && event.targetId === id && event.source === "controlled" && event.hpRemoved > 0));
    }
    case "round6-reinforcement-controlled-kill":
      return controlledDamage.some(event => event.target === "enemy" && event.lethal && event.waveId === rule.reinforcementId);
    case "all-three-bases-allied-at-one-round-end":
      return rounds.some(event => event.bases.filter(base => base.allied).length >= rule.minAlliedOwnedBases!);
    case "data-carrier-initiates-pair-before-upload":
      return duringCarry.some(event => event.kind === "carrier-pair");
    case "controlled-guards-facility-late-at-round-end":
      return rounds.some(event => event.round >= rule.minRound! && event.guardedIds.includes(rule.structureId!));
    case "same-controlled-unit-depot-hit-and-base-occupy":
      return rounds.some(event => event.bases.some(base => depotHits.some(hit => hit.sourceId === base.controlledId)));
    case "breakthrough-actor-also-damaged-depot":
      return evidence.winningCrossers?.slice(0, 2).some(id => depotHits.some(hit => hit.sourceId === id)) ?? false;
    case "transport-advanced-and-controlled-base-same-round":
      return rounds.some(event => event.transportAdvance === rule.transportAdvanceRequired && event.bases.some(base => !!base.controlledId));
    case "boss-positive-controlled-damage-before-first-data-collection":
    case "depot-positive-controlled-damage-before-first-data-collection":
      return firstPickup >= 0 && events.slice(0, firstPickup).some(event =>
        event.kind === "damage" && event.source === "controlled" && event.hpRemoved > 0 &&
        (rule.bossId ? event.target === "enemy" && event.targetId === rule.bossId : event.target === "depot"));
    case "same-controlled-unit-maintains-base-during-winning-streak": {
      const previous = evidence.winningRoundEnds?.at(-2);
      return !!previous && !!lastWinningRound && lastWinningRound.round === previous.round + 1 &&
        lastWinningRound.bases.some(base => !!base.controlledId && previous.bases.some(old => old.cell === base.cell && old.controlledId === base.controlledId));
    }
    case "min-controlled-alive-on-final-round":
      return evidence.round === 16 && (evidence.controlledSurvivors ?? 0) >= rule.minControlledSurvivors!;
    default: return false;
  }
}

/** Adapt the stages that currently have authoritative Core state. */
export function getRobotSubobjectiveAchieved(s: RobotBattleCoreState): boolean {
  const evidence: RobotSubobjectiveEvidence = { result: getRobotBattleResult(s).result, round: s.allied.round };
  if (s.sortieSubobjectiveEligible !== undefined) evidence.sortieEligible = s.sortieSubobjectiveEligible;
  if (s.objective.kind === "m01") evidence.facility = s.objective.state.objects.objects[0]!;
  if (s.objective.kind === "m30") evidence.controlledSurvivors = s.units.filter(u => u.kind === "controlled" && u.hp > 0).length;
  if (s.objective.kind === "early") {
    const stage = s.objective.state;
    if (stage.subobjectiveHistory) evidence.early = stage.subobjectiveHistory;
    evidence.winningCrossers = stage.arrivedIds;
    if (stage.missionNumber === 5) evidence.transport = stage.objects.objects[0]!;
    if (stage.missionNumber === 8) evidence.facility = stage.objects.objects[0]!;
    evidence.dataSentWithoutDrop = stage.data?.sent === true && stage.data.collectedRound !== null && stage.subobjectiveHistory?.dataDropped === false;
    if (stage.missionNumber === 6 && stage.objects.completedRound === s.allied.round) {
      const bases = robotEarlyGoalCells(s.key).map((cell, index) => {
        const unit = s.units.find(u => u.kind === "controlled" && u.hp > 0 && u.position && sameRobotCoreCell(u.position, cell));
        return { cell: String(index), allied: stage.controlOwners[index] === "allied", ...(unit ? { controlledId: unit.id } : {}) };
      });
      evidence.winningRoundEnds = [{ kind: "round-end", round: s.allied.round, bases, guardedIds: [], transportAdvance: 0 }];
    }
  }
  return evaluateRobotSubobjective(s.key, evidence);
}

const labels: Readonly<Record<string, string>> = {
  slash: "斬撃", blunt: "打撃", thrust: "刺突", assault: "連射", sniper: "狙撃", blast: "爆撃",
  mobile: "機動力", defense: "防御", reactor: "炉心", attack: "攻撃",
};
export function getRobotSubobjectiveText(missionNumber: number, easy: boolean): string | null {
  const display = conditionFor({ missionNumber, difficulty: easy ? "easy" : "normal" })?.displayText;
  return display?.replace(/\b(slash|blunt|thrust|assault|sniper|blast|mobile|defense|reactor|attack)\b/g, key => labels[key]!) ?? null;
}
