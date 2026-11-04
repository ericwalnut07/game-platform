import catalog from "../../../docs/design/robot-tactics/addons.json";
import type { RobotBattleCoreState } from "./battleState";
const effect = catalog.parts.find(p=>p.id==="shared-victory-recovery-circuit")!.effect as { radius:number; enRestoreEach:number };
const ally = (kind: string) => kind === "controlled" || kind === "friendly-ai";
/** Separate equipment event: no normal/reaction/DOT/fuse recovery allowance is spent. */
export function recordRobotSharedVictory(s: RobotBattleCoreState, sourceId: string, targetId: string, attackId: string): RobotBattleCoreState {
  const source = s.units.find(u => u.id === sourceId), defeated = s.units.find(u => u.id === targetId);
  if (!source || !defeated || !ally(source.kind) || ally(defeated.kind) || defeated.hp !== 0 || s.sharedVictoryDefeats?.includes(targetId)) return s;
  const wearers = s.units.filter(u => ally(u.kind) && u.hp > 0 && u.position && u.addons?.some(a => a.partId === "shared-victory-recovery-circuit"));
  if (!wearers.length) return s;
  let units = [...s.units]; const recoveries = [...(s.pendingEnergyRecoveries ?? [])];
  for (const wearer of wearers) units = units.map(u => {
    if (!ally(u.kind) || !u.position || u.hp === 0 || Math.max(Math.abs(u.position.x - wearer.position!.x), Math.abs(u.position.y - wearer.position!.y)) > effect.radius) return u;
    const en = Math.min(u.energy.maxEn, u.energy.en + effect.enRestoreEach), amount = en - u.energy.en;
    if (amount) recoveries.push({ id: `${attackId}:shared:${targetId}:${wearer.id}:${u.id}`, unitId: u.id, cell: { ...u.position }, amount });
    return amount ? { ...u, energy: { ...u.energy, en } } : u;
  });
  return { ...s, units, sharedVictoryDefeats: [...(s.sharedVictoryDefeats ?? []), targetId], ...(recoveries.length ? { pendingEnergyRecoveries: recoveries } : {}) };
}
