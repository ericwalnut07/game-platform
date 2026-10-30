import { expect, it } from "vitest";
import { getRobotStagePlan, listRobotStageKeys, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotLegalMoves, getRobotMovementOffsets, robotCellToPosition, robotPositionToCell, type RobotMovementQuery, type RobotMovementType } from "../../src/games/robot-tactics/movement";

it("smokes movement on 90 catalog plans without approving candidate stages or path rules", () => {
  const types: readonly RobotMovementType[] = ["straight", "diagonal", "omni", "forward"];
  let queries = 0, routes = 0;
  for (const stageKey of listRobotStageKeys()) {
    const plan = getRobotStagePlan(stageKey);
    const walls = plan.board.walls.map(robotCellToPosition);
    const units = [...plan.players, ...plan.friendlyAI.map(a => a.cell), ...plan.initialEnemies.flatMap(e => e.cells)];
    const blockedKeys = new Set([...plan.board.walls, ...units]);
    for (const originCell of plan.players) for (const type of types) {
      const origin = robotCellToPosition(originCell);
      const query: RobotMovementQuery = {
        board: { ...plan.board, walls }, origin, types: [type], mov: 7, facing: "north",
        occupied: units.filter(c => c !== originCell).map(robotCellToPosition), structures: [],
        // Test-only eight-way, lenient corner, 8-step policy. Not formal rules.
        // Objective durability/structure adapters are deliberately not guessed.
        traversal: { adjacency: "eight-way", diagonalCorners: "block-if-both-sides-blocked", maxSteps: 8 }
      };
      const footprint = new Set(getRobotMovementOffsets(query).map(p => p.x + "," + p.y));
      const moves = getRobotLegalMoves(query);
      expect(new Set(moves.map(m => robotPositionToCell(m.destination))).size).toBe(moves.length);
      const audit = (ok: boolean, message: string): void => {
        if (!ok) throw new Error(JSON.stringify({ stageKey, originCell, type, message }));
      };
      for (const move of moves) {
        audit(footprint.has((move.destination.x - origin.x) + "," + (move.destination.y - origin.y)), "Destination outside footprint");
        audit(move.path.length > 0 && move.path.length <= 8, "Path budget");
        audit(robotPositionToCell(move.path.at(-1)!) === robotPositionToCell(move.destination), "Path endpoint");
        let previous = origin;
        for (const step of move.path) {
          audit(step.x >= 0 && step.y >= 0 && step.x < plan.board.width && step.y < plan.board.height, "Step outside board");
          audit(!blockedKeys.has(robotPositionToCell(step)), "Step enters blocker");
          audit(Math.max(Math.abs(step.x - previous.x), Math.abs(step.y - previous.y)) === 1, "Nonadjacent step");
          if (step.x !== previous.x && step.y !== previous.y) {
            const sideA = robotPositionToCell({ x: step.x, y: previous.y });
            const sideB = robotPositionToCell({ x: previous.x, y: step.y });
            audit(!(blockedKeys.has(sideA) && blockedKeys.has(sideB)), "Closed diagonal corner");
          }
          previous = step;
        }
        routes++;
      }
      queries++;
    }
    expect(plan.isReadyForFormalPlay).toBe(false);
    expect(() => requireApprovedRobotStage(stageKey)).toThrow();
  }
  expect(queries).toBe(1080);
  expect(routes).toBeGreaterThan(0);
});
