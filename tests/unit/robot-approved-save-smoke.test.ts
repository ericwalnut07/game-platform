import { expect, it } from "vitest";
import { approvedFormalCases, approvedFormalProgress, approvedFormalAction, type ApprovedFormalCase } from "../robot-tactics/approvedFormalController";
import { RobotOfflineSession, createRobotOfflineSave, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
class Storage implements RobotOfflineStorage {
    raw: string;
    fail = false;
    constructor(kind: ApprovedFormalCase) { this.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: approvedFormalProgress(kind) }); }
    async read() { return this.raw; }
    async replace(expected: string | null, next: string) { if (this.fail)
        throw new Error("disk-full"); if (this.raw !== expected)
        throw new Error("stale"); this.raw = next; }
}
for (const kind of approvedFormalCases)
    it(`real M01 ${kind}: all subphases save atomically, resume/replay and retry`, async () => {
        const storage = new Storage(kind);
        let serial = 0;
        const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "approved-M01-" + ++serial);
        await session.load();
        await session.start({ missionNumber: 1, difficulty: kind === "post-moves" || kind === "chain-slash-reactor" ? "easy" : "hard" });
        let complete = false, pending = 0;
        for (let n = 0; n < 100; n++) {
            const before = session.state, b = before.battle!;
            if (!b)
                throw new Error("Ended before adopted case " + kind);
            const s = decodeRobotBattleCore(b.snapshot), u = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!), action = approvedFormalAction(s, kind), command = (action as {
                kind: string;
            }).kind;
            const use = u.id === "core-c" && !["move", "charge"].includes(command);
            expect(() => robotFormalBattleAdapter.project(b)).not.toThrow();
            const input = { battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "test-" + n, action };
            if (use) {
                storage.fail = true;
                await expect(session.act(input)).rejects.toThrow("disk-full");
                expect(session.state).toEqual(before);
                storage.fail = false;
            }
            await session.act(input);
            const checkpoint = session.state;
            if (checkpoint.battle)
                expect(() => robotFormalBattleAdapter.project(checkpoint.battle!)).not.toThrow();
            if (use) {
                const after = decodeRobotBattleCore(checkpoint.battle!.snapshot);
                await session.act(input);
                expect(session.state).toEqual(checkpoint);
                const resumed = new RobotOfflineSession(storage, robotFormalRuntime, () => "retry-approved");
                await resumed.load();
                expect(resumed.state).toEqual(checkpoint);
                if (after.afterAttack) {
                    pending++;
                    continue;
                }
                if (kind === "chain-slash-reactor" && command !== "chain-followup")
                    continue;
                if (kind === "post-moves")
                    expect(pending).toBe(2);
                if (kind === "tactical-marking-attack")
                    expect(after.units.some(v => v.tacticalMark)).toBe(true);
                if (kind === "weakpoint-targeting")
                    expect(after.units.some(v => v.weakpoint)).toBe(true);
                if (kind === "resupply-field")
                    expect(after.resupplyField).toBeDefined();
                if (kind === "tactical-decoy")
                    expect(after.decoys).toHaveLength(1);
                if (kind === "assault-debuff-extension")
                    expect(after.units.some(v => v.weaponDebuffs?.some(d => d.untilOwnTurn !== undefined))).toBe(true);
                await resumed.retry(true);
                const retry = decodeRobotBattleCore(resumed.state.battle!.snapshot);
                expect(retry.afterAttack).toBeUndefined();
                expect(retry.decoys).toBeUndefined();
                expect(retry.resupplyField).toBeUndefined();
                complete = true;
                break;
            }
        }
        expect(complete).toBe(true);
    });
