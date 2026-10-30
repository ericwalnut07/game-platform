# Movement Core: destination geometry and explicit traversal evaluation

Base: PR #69, `9cd9b699934318ef8dbf0752db05b239f96dd1c9`.
This is an isolated Pure TypeScript building block, not a launchable battle.

## Geometry sources

- MOV1–5: the exact `reach()` destination sets in the original
  `robot_tactics_movement_patterns_v01.html` comparison, created 2026-10-24
  05:31 UTC and accepted by the user later that day (06:07 UTC).
  The source explicitly leaves intermediate movement/obstacle rules undecided.
  `tests/fixtures/robot-movement-adopted-v01.json` captures all 20 sets from that
  source independently of the new implementation. No simplified playtest BFS is
  used to infer these sets.
- MOV6–7: `current-group-combat.json/combat/movement`, preserving the original
  MOV1–5 shapes, the symmetric additions, and the complete forward row tables.
  The forward row tables for MOV6/7 represent full footprints, not extra cells.
- Counts excluding origin: 8/12/24/36/48/60/80 for straight, diagonal and omni;
  forward MOV4 has 35 instead of 36. Every previous footprint is a subset of the
  next one. Omni MOV7 is the complete 9×9 square excluding origin.
- Forward is explicitly oriented north/east/south/west toward the opposing
  deployment edge. No side-to-direction assignment is guessed.
- Movement-type additions form a set union, with shared destinations deduplicated.
- MOV8+ is rejected as unresolved geometry. This is not a new system MOV cap.

### Existing forward MOV5 reference discrepancy

The saved `forwardRowsMov5Reference` field does not reproduce the accepted
comparison, although both have 48 destinations. Coordinates below are local,
with north/forward = negative Y:

| Present only in accepted comparison | Present only in JSON reference |
| --- | --- |
| (±1, −6), (±2, −5), (±3, −4) | (±4, −2), (±4, −1), (±2, +1) |

The Core preserves the accepted original coordinates under the existing
`preserveExistingMov1Through5Geometry` instruction. It does not rewrite the
design JSON, silently substitute the reference rows, or claim that this
discrepancy has been approved as a design change. The original forward shapes
also remain subsets of the adopted MOV6/7 full tables.

## API and boundaries

`getRobotMovementOffsets()` returns destination offsets. It does not establish
that a path to a destination is legal.

`getRobotLegalMoves()` and `checkRobotMove()` evaluate routes only under a
mandatory caller-supplied `RobotTraversalPolicy`. There is no default policy.
Missing/invalid policy is rejected, and no formal battle or registry calls these
helpers. The interface intentionally exposes the unresolved design choices:

- adjacent orthogonal steps or eight-way steps;
- unrestricted diagonal corners, blocked when both side cells are blocked, or
  blocked when either side cell is blocked;
- maximum path length in adjacent-cell steps.

Walls, all occupied living-unit cells, and all provided structure cells block
both travel and landing. Occupancy must exclude the moving actor. The evaluator
finds shortest paths within the explicit budget, constrains the destination to
the selected footprint, and permits intermediate cells outside that footprint.
It returns paths excluding origin and including destination. Origin itself is
not a move; waiting belongs to a later turn/action layer.

The A1 coordinate helpers connect Stage Catalog cells to zero-based positions,
including multi-letter columns. Objective-to-structure adapters, equipment
movement values, team-facing assignment, turn/EN consumption, LOS, attacks,
formations, AI, respawn and mission execution are not added here.

## Design decision required before formal traversal

The original comparison and `rules.json/combat/uncertainMechanics` explicitly
leave obstacle paths/corners undecided. The old v0.6 prototype used eight-way
steps, a maximum step count equal to the footprint's furthest Chebyshev distance,
and disallowed diagonals only when both orthogonal side cells were blocked.
That prototype behavior is not automatically adopted by this PR.

Proposal for user review: use that eight-way/bounded-distance policy, permit
detours outside the destination footprint within the budget, and block diagonal
steps when both side cells are blocked. Example budgets: omni MOV3 = 2 adjacent
steps, straight/diagonal MOV3 = 3, forward MOV3 = 4; omni MOV7 = 4,
straight/diagonal MOV7 = 7, forward MOV7 = 8. The current API requires the caller
to specify these values; it does not select this proposal.

All 90 plans still fail `requireApprovedRobotStage()`. Candidate stages,
composite objectives, missing durability, enemy levels and boss mechanics remain
blocked exactly as in PR #69.

## Focused verification

- Scoped strict TypeScript check of movement and Stage Catalog: PASS.
- Vitest movement Unit 42 + existing Stage Catalog 5 + movement smoke 1:
  **48 tests PASS**.
- Smoke: 90 plans × 3 player origins × 4 movement types = **1,080 queries**,
  checking bounds, blockers, adjacent paths, corner restrictions, footprint
  membership, budgets, uniqueness, and unchanged formal-stage guards.
  This uses an explicit TEST policy, MOV7, and walls/living-unit occupancy.
  Objective structure adapters are not guessed. It does not establish formal
  traversal, initial-placement quality, stage approval, balance or clear rates.
- Windows device `ericwalnut` was offline. No Windows verification performed.
- No UI/registry/server/storage/DB change: manual UI/E2E, migration checks and
  local production build are outside this isolated Core increment. Existing
  repository CI may execute its additional configured checks.
- No merge, deploy, production migrations or secret changes.
