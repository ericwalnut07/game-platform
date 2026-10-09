import type { HubState } from "../../games/commercial-hub/state";
import type { LearningJournal, LearningRecord } from "../../games/commercial-hub/learning";
import { APP_VERSION } from "../../shared/version";
import { chunkWrites, deleteChunks, matchSeats, readChunks, type ChunkStorage } from "./log-archive";
export const archiveKey = (id: string) => `hubArchive:${id}`;
export const snapshotKey = (id: string) => `hubSnapshot:${id}`;
export const recordKey = (id: string, seq: number) => `hubLearning:${id}:${seq}`;
export interface HubArchiveManifest {
  matchId: string; roomCode: string; startedAt: number; appVersion: string; rulesVersion: string;
  key: string; generation: number; uploaded: number; summarized: number;
  endedAt: number | null; endReason: string | null; terminal: boolean; failures: number;
}
export function createArchive(state: HubState, roomCode: string, startedAt: number): HubArchiveManifest {
  const month = new Date(startedAt).toISOString().slice(0, 7);
  return { matchId: state.matchId, roomCode, startedAt, appVersion: APP_VERSION, rulesVersion: state.rulesVersion,
    key: `commercial-hub/matches/${state.rulesVersion}/${month}/${state.matchId}.json.gz`,
    generation: 0, uploaded: -1, summarized: -1, endedAt: null, endReason: null, terminal: false, failures: 0 };
}
/** Full PUBLIC play history plus server-side economics. No hands, future bag, credentials or pending/rejected private terms. */
export function publicArchive(state: HubState, manifest: HubArchiveManifest) {
  const snapshot = matchSeats({ gameId: state.gameId, matchId: state.matchId, rulesVersion: state.rulesVersion, revision: state.revision,
    phase: state.phase, round: state.round, players: state.players, config: state.config, npcPlayers: state.npcPlayers ?? {},
    cityCondition: state.cityCondition, opportunities: state.opportunities, trickResults: state.trickResults,
    companies: state.companies, buildings: state.buildings, routes: state.routes, publicProjects: state.publicProjects,
    negotiations: state.negotiations.filter(n => n.status === "ACCEPTED"),
    bids: state.bidsRevealed ? state.bids : {}, bidResults: state.bidResults, predictionPoints: state.predictionPoints,
    auditor: state.auditor, cityLevel: state.cityLevel, cityDevelopment: state.cityDevelopment,
    roundStatistics: state.roundStatistics, cityLevel4Round: state.cityLevel4Round,
    finalRound: state.finalRound, finalRoundDecision: state.finalRoundDecision, cityReachedRounds: state.cityReachedRounds,
    settlement: state.settlement, companyValues: state.companyValues, events: state.events, result: state.result }, state.players);
  return { schemaVersion: 1, metadata: { matchId: manifest.matchId, appVersion: manifest.appVersion,
    rulesVersion: manifest.rulesVersion, startedAt: manifest.startedAt, endedAt: manifest.endedAt,
    endReason: manifest.endReason, complete: !!state.result, terminal: manifest.terminal }, snapshot };
}
export type HubPublicArchive = ReturnType<typeof publicArchive>;
export function learningWrites(journal: LearningJournal): Record<string, unknown> {
  return Object.assign({}, ...journal.queue.map(r => chunkWrites(recordKey(journal.matchId, r.sequence), r)));
}
export async function storedLearning(storage: ChunkStorage, journal: LearningJournal): Promise<LearningRecord[]> {
  const records: LearningRecord[] = [];
  for (let seq = 1; seq <= journal.sequence; seq++) {
    const r = await readChunks<LearningRecord>(storage, recordKey(journal.matchId, seq));
    if (r && !r.privateSeats.some(seat => journal.withdrawnSeats.includes(seat))) records.push(r);
  }
  return records;
}
export async function removeWithdrawnLearning(storage: ChunkStorage, journal: LearningJournal): Promise<void> {
  if (!journal.withdrawnSeats.length) return;
  for (let seq = 1; seq <= journal.sequence; seq++) {
    const r = await readChunks<LearningRecord>(storage, recordKey(journal.matchId, seq));
    if (r?.privateSeats.some(seat => journal.withdrawnSeats.includes(seat))) await deleteChunks(storage, recordKey(journal.matchId, seq));
  }
}
export async function clearArchive(storage: ChunkStorage, manifest: HubArchiveManifest, journal?: LearningJournal): Promise<void> {
  if (journal) for (let i = 1; i <= journal.sequence; i++) await deleteChunks(storage, recordKey(manifest.matchId, i));
  await deleteChunks(storage, snapshotKey(manifest.matchId));
  await storage.delete(archiveKey(manifest.matchId));
  await storage.delete(`learning:${manifest.matchId}`);
}
export async function clearArchiveLearning(storage: ChunkStorage, journal: LearningJournal): Promise<void> {
  for (let i = 1; i <= journal.sequence; i++) await deleteChunks(storage, recordKey(journal.matchId, i));
}
