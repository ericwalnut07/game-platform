import { getRobotBattleBlastObjectPacket } from "./battleFacilityActions";
import { getRobotActionEnergyBlock } from "./energy";
import { getRobotBlastAddonPlan, getRobotBlastSelectionCost, type RobotBlastMode } from "./blastAddons";
import { getRobotBlastFootprint } from "./blast";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial } from "./attackResolution";
import { resolveRobotBasicPart } from "./equipment";
import { isRobotBattleHostileObject, getRobotBattleActor, getRobotBattleUnit, getRobotBattleFacilities, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, decodeRobotBattleCore, type RobotBattleCoreState } from "./battleState";
import { commitRobotBattleBatch } from "./battleBatch";
import { getRobotBattleBlastPacket, getRobotHazardBlastPacket } from "./battleWeaponActions";
import type { RobotPosition } from "./movement";

export interface RobotBlastLocation { readonly cell: RobotPosition; readonly neighborIds: readonly string[] }
function held(s: RobotBattleCoreState, weaponId: string) {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || source.kind === "light" || !source.position || source.hp <= 0 || source.energy.action || source.statuses.length) throw new Error("Current living single blast actor required");
  const selection = source.parts.find(p => p.partId === weaponId), weapon = selection && resolveRobotBasicPart(selection.partId, selection.level);
  if (!selection || weapon?.weaponFamily !== "blast") throw new Error("Equipped blast weapon required");
  return { source, selection, weapon };
}
function reaches(s: RobotBattleCoreState, origin: RobotPosition, target: RobotPosition, min: number, max: number) {
  return checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin, target, min, max }), sight: { board: s.board, origin, target } }).canReach;
}
export function getRobotBattleBlastOptions(s: RobotBattleCoreState, weaponId: string, mode: RobotBlastMode) {
  const { source, selection, weapon } = held(s, weaponId), plan = getRobotBlastAddonPlan(selection, source.addons ?? [], mode);
  const enemies = s.units.filter(u => robotBattleIsAlly(u) !== robotBattleIsAlly(source) && u.hp > 0 && u.position);
  const objects=mode==="fire"?[]:getRobotBattleFacilities(s).filter(o=>o.hp>0&&isRobotBattleHostileObject(s,source.id,o.id));
  const centers: { cell: RobotPosition; targetId: string | null; areaCells: readonly RobotPosition[]; neighborIds: readonly string[]; minimumNeighbors: number }[] = [];
  if (!getRobotActionEnergyBlock(source.energy, plan.baseEnergyCost)) for (let y = 0; y < s.board.height; y++) for (let x = 0; x < s.board.width; x++) {
    const cell = { x, y }, occupied = s.units.find(u => u.hp > 0 && u.position && sameRobotCoreCell(u.position, cell));
    const object=objects.find(o=>o.cells.some(c=>sameRobotCoreCell(c,cell)));
    if (s.board.walls.some(c => sameRobotCoreCell(c, cell)) || getRobotBattleFacilities(s).some(f => f.cells.some(c => sameRobotCoreCell(c, cell))) && !object || occupied && !enemies.includes(occupied) || !occupied && !object && !plan.emptyCenters || !reaches(s, source.position!, cell, weapon.range!.min, weapon.range!.max)) continue;
    const areaCells = getRobotBlastFootprint({ weapon: selection, center: cell, board: s.board }).neighborCells;
    // Center legality above still requires the firing weapon's range/LOS.
    // Collateral targets are governed only by the blast footprint, even
    // if a wall blocks the ray from the attacker to the adjacent entity.
    const neighborIds = enemies.filter(u => u !== occupied && areaCells.some(c => sameRobotCoreCell(c, u.position!))).map(u => u.id);
    neighborIds.push(...objects.filter(o => o !== object && o.cells.some(c => areaCells.some(a => sameRobotCoreCell(a, c)))).map(o => o.id));
    if (!occupied && !object && !neighborIds.length) continue;
    centers.push({ cell, targetId: occupied?.id ?? object?.id ?? null, areaCells, neighborIds, minimumNeighbors: occupied || object ? 0 : 1 });
  }
  return { plan, availableEn: source.energy.lockedUntilOwnTurn === undefined ? source.energy.en : 0, additionalCostBlockedReason: source.energy.lockedUntilOwnTurn === undefined ? null : "機能封鎖中", centers, disabledReason: getRobotActionEnergyBlock(source.energy, plan.baseEnergyCost) ?? (centers.length < plan.centerCount ? "合法な中心地点がありません（射程・射線を確認）" : null) };
}
/** Validate all locations before applying any HP/EN. Overlapping selected roles
 * collapse to one entity receipt using its largest coefficient (center wins).
 */
export function commitRobotBattleBlast(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly weaponId: string; readonly mode: RobotBlastMode; readonly locations: readonly RobotBlastLocation[] }) {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const { source } = held(s, input.weaponId), options = getRobotBattleBlastOptions(s, input.weaponId, input.mode);
  if (options.disabledReason) throw new Error(options.disabledReason);
  if (input.locations.length !== options.plan.centerCount || new Set(input.locations.map(l => l.cell.x + "," + l.cell.y)).size !== input.locations.length) throw new Error("Distinct adopted blast locations required");
  const targets = new Map<string, { center: RobotPosition; mode: "burst-center" | "burst-neighbor" }>();
  const footprints: RobotPosition[] = [], emptyCenters: RobotPosition[] = [];
  for (const location of input.locations) {
    const center = options.centers.find(c => sameRobotCoreCell(c.cell, location.cell));
    if (!center || location.neighborIds.length < center.minimumNeighbors || location.neighborIds.length > options.plan.neighborCap || new Set(location.neighborIds).size !== location.neighborIds.length || location.neighborIds.some(id => !center.neighborIds.includes(id))) throw new Error("Legal center and distinct manually selected blast neighbors required");
    if (center.targetId) targets.set(center.targetId, { center: center.cell, mode: "burst-center" }); else emptyCenters.push(center.cell);
    for (const id of location.neighborIds) if (targets.get(id)?.mode !== "burst-center") targets.set(id, { center: center.cell, mode: "burst-neighbor" });
    footprints.push(center.cell, ...center.areaCells);
  }
  const centerIds=input.locations.flatMap(l=>{const id=options.centers.find(c=>sameRobotCoreCell(c.cell,l.cell))!.targetId;return id?[id]:[];});if(new Set(centerIds).size!==centerIds.length)throw new Error("Distinct center entities required");
  const energyCost = getRobotBlastSelectionCost(options.plan, input.locations.map(l => l.neighborIds.length));
  if (getRobotActionEnergyBlock(source.energy, energyCost)) throw new Error(getRobotActionEnergyBlock(source.energy, energyCost)!);
  const packets = [...targets].map(([id,role])=>{
    const object=getRobotBattleFacilities(s).find(o=>o.id===id);
    if(object){const area=getRobotBlastFootprint({weapon:held(s,input.weaponId).selection,center:role.center,board:s.board}).neighborCells;const cells = object.cells.filter(c => role.mode === "burst-center"
      ? sameRobotCoreCell(c, role.center)
      : area.some(a => sameRobotCoreCell(a, c)));return getRobotBattleBlastObjectPacket(s,source.id,input.weaponId,id,input.actionId+":hit:1",role.mode,cells);}
    return input.mode==="fire"?getRobotHazardBlastPacket(s,input.weaponId,id,input.actionId+":hit:1",role.center,role.mode==="burst-neighbor"):getRobotBattleBlastPacket(s,input.weaponId,id,input.actionId+":hit:1",role.mode,role.center);
  });
  const after = commitRobotBattleBatch(s, { actionId: input.actionId, turnId: input.turnId, summary: source.name + (input.mode === "double" ? "：二点起爆" : input.mode==="fire"?"：残留爆炎":"：爆撃") + `（EN${energyCost}）`, ...(input.mode==="fire"?{fireCenter:input.locations[0]!.cell}:{}), members: [{ unitId: source.id, action: { kind: input.mode !== "burst" ? "other" : "normal-attack", energyCost } }], attacks: [{ ...packets[0]!, targets: packets.flatMap(p => p.targets) }] });
  return decodeRobotBattleCore({ ...after, latest: { ...after.latest!, areaCells: footprints.filter((p, i, a) => a.findIndex(c => sameRobotCoreCell(c, p)) === i), ...(emptyCenters.length ? { blastEmptyCenters: emptyCenters } : {}) } });
}
