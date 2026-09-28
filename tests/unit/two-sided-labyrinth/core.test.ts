import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { STAGES, RULES_VERSION } from "../../../src/games/two-sided-labyrinth/catalog";
import { loadStage } from "../../../src/games/two-sided-labyrinth/stage-loader";
import { createStageState, applyStageAction, type AdvancedAction } from "../../../src/games/two-sided-labyrinth/core/prototype-stage-core-v1.0";
import { createLabyrinthState, parseLabyrinthAction, reduceLabyrinth, labyrinthResult, parseLabyrinthConfig } from "../../../src/games/two-sided-labyrinth/runtime";
import { buildFaceView, buildLabyrinthView } from "../../../src/games/two-sided-labyrinth/view";
import { restoreSolo } from "../../../src/games/two-sided-labyrinth/solo";
import { parseCoreAction } from "../../../src/games/two-sided-labyrinth/actions";
import type { Face } from "../../../src/games/two-sided-labyrinth/core/layered-stage-contract-v0.6";
import tutorials from "../../fixtures/two-sided-labyrinth/tutorials.json";
import digests from "../../fixtures/two-sided-labyrinth/asset-digests.json";
export const players = [{ id: "A", displayName: "表役" }, { id: "B", displayName: "裏役" }];
const fresh = () => createLabyrinthState("m", players, { stageId: "tutorial-01" }, 1000);
describe("labyrinth fixed assets and shared Core", () => {
  it.each(STAGES)("$stageId retains supplied geometry and initializes safely", ({ stageId }) => {
    const stage = loadStage(stageId);
    expect(createHash("sha256").update(JSON.stringify(stage)).digest("hex")).toBe(digests[stageId]);
    const core = createStageState(stage);
    for (const face of ["front", "back"] as const) {
      const view = buildFaceView(stageId, core, face);
      expect(view.cells.find((c) => c.x === view.position.x && c.y === view.position.y)?.passable).toBe(true);
      expect(view.cells).toHaveLength(stage.width * stage.height);
    }
  });
  it.each(tutorials)("$stageId replays identically through online clocked runtime and solo", ({ stageId, steps }) => {
    let state = createLabyrinthState("m", players, parseLabyrinthConfig({ stageId }), 1000);
    state = reduceLabyrinth(state, { playerId: "A", command: { type: "READY" } }, 1100);
    state = reduceLabyrinth(state, { playerId: "B", command: { type: "READY" } }, 2000);
    let solo = createStageState(loadStage(stageId));
    for (let i = 0; i < steps.length; i++) {
      const [side, raw] = steps[i]!, face = side as Face, action = parseCoreAction(raw);
      solo = applyStageAction(loadStage(stageId), solo, { playMode: "SOLO_PRACTICE", selectedFace: face }, action);
      state = reduceLabyrinth(JSON.parse(JSON.stringify(state)), { playerId: face === "front" ? "A" : "B", command: action }, 3000 + i * 100);
      expect(state.core).toEqual(solo);
    }
    expect(state.phase).toBe("FINISHED"); expect(labyrinthResult(state)?.official).toBe(false);
    expect(labyrinthResult(state)?.elapsedMs).toBe(1000 + (steps.length - 1) * 100);
  });
  it("waits for both ready; uses server time only and retains it over JSON/reload", () => {
    let s = fresh(); expect(() => reduceLabyrinth(s, parseLabyrinthAction({ type: "MOVE", direction: "north" }, "A"), 1200)).toThrow();
    s = reduceLabyrinth(s, parseLabyrinthAction({ type: "READY", now: 0 }, "A"), 1200); expect(s.startedAt).toBeNull();
    expect(reduceLabyrinth(s, parseLabyrinthAction({ type: "READY" }, "A"), 5000)).toEqual(s);
    s = reduceLabyrinth(s, parseLabyrinthAction({ type: "READY" }, "B"), 10000);
    s = reduceLabyrinth(JSON.parse(JSON.stringify(s)), parseLabyrinthAction({ type: "MOVE", direction: "north", playerId: "B", face: "back" }, "A"), 50000);
    expect(s.startedAt).toBe(10000); expect(s.core.position.back).toEqual(loadStage(s.stageId).start.back);
    expect(() => reduceLabyrinth(s, parseLabyrinthAction({ type: "MOVE", direction: "north" }, "outsider"), 60000)).toThrow();
  });
  it("projects only assigned geometry, position and inventory; never full state or opposite board", () => {
    const s = createLabyrinthState("m", players, { stageId: "challenge-10" }, 0);
    const a = buildLabyrinthView(s, "A", 100), b = buildLabyrinthView(s, "B", 100);
    expect(a.board.face).toBe("front"); expect(b.board.face).toBe("back");
    for (const v of [a,b]) {
      expect(Object.keys(v)).not.toContain("core"); expect(Object.keys(v)).not.toContain("players");
      expect(JSON.stringify(v)).not.toMatch(/sourceGlyphs|terrain|initialLocation|serverSeatAssignment|mirrorFrontDiagonal/);
      expect(v.board.position).toEqual(s.core.position[v.face]);
    }
    expect(() => buildLabyrinthView(s, "intruder")).toThrow();
  });
  it("blocks transfer-port entry from a legal tutorial-08 prefix without changing the state", () => {
    const r = tutorials.find((t) => t.stageId === "tutorial-08")!, stage = loadStage(r.stageId);
    let s = createStageState(stage);
    for (const [face, action] of r.steps.slice(0,9)) s = applyStageAction(stage,s,{playMode:"SOLO_PRACTICE",selectedFace:face as Face},parseCoreAction(action));
    const old = structuredClone(s);
    expect(s.position.back).toEqual({x:6,y:28});
    expect(() => applyStageAction(stage,s,{playMode:"SOLO_PRACTICE",selectedFace:"back"},{type:"MOVE",direction:"east"})).toThrow();
    expect(s).toEqual(old);
  });
  it("restores solo by replay; refuses forged, incompatible or cross-mode saves", () => {
    const r = tutorials[0]!, steps = r.steps.slice(0,3).map(([face, action]) => ({face,action}));
    const save = { rulesVersion:RULES_VERSION,playMode:"SOLO_PRACTICE",stageId:r.stageId,elapsedMs:1234,activeFace:"back",steps };
    const restored = restoreSolo(JSON.stringify(save)); expect(restored.core.acceptedActions).toBe(3); expect(restored.save.elapsedMs).toBe(1234);
    for (const changed of [{playMode:"ONLINE_DUO"},{rulesVersion:"old"},{elapsedMs:-1},{steps:[{face:"front",action:{type:"MOVE",direction:"teleport"}}]}]) expect(() => restoreSolo(JSON.stringify({...save,...changed}))).toThrow();
  });
  it.each([null, {}, {type:"MOVE",direction:"up"}, {type:"POWER",circuitId:""}, {type:"READY"}, {type:"RESET"}])("rejects malformed Core action %j", (input) => expect(() => parseCoreAction(input)).toThrow());
  it("does not mutate the inactive face on a normal step or accept additional play after clear", () => {
    const stage = loadStage("tutorial-01"), initial = createStageState(stage), old = structuredClone(initial);
    const next = applyStageAction(stage,initial,{playMode:"SOLO_PRACTICE",selectedFace:"front"},{type:"MOVE",direction:"north"});
    expect(initial).toEqual(old); expect(next.position.back).toEqual(initial.position.back);
    expect(() => applyStageAction(stage,{...next,complete:true},{playMode:"SOLO_PRACTICE",selectedFace:"front"},{type:"MOVE",direction:"north"})).toThrow();
  });
});
