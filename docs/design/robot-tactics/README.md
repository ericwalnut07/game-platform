# Robot tactics — implementation-first design snapshot

This is a **non-runtime design data snapshot** for the new 3-unit solo robot tactics game. The game's **official title and gameId are not yet chosen**. Directory name `robot-tactics` is only a provisional slug.

## Canonical data in this directory

- `rules.json`: stat model, actions, costs, combat math, mission progression, reward formulas and recommended levels.
- `frames.json`: nine frame groups / ten selectable models, with Lv1/21/41 stat totals and unlock conditions.
- `basic-parts.json`: all **46** levelable basic parts, including **22 weapons** (the original 44 plus two 30-mission-clear weapons).
- `addons.json`: **60** non-levelable addon parts (one each from the Normal/Hard subgoals).
- `easy-07-proposal.json`: **unapproved candidate** for Easy M07 time-limited dual-device activation: 11×9 map, left/right devices with one-action interactions, six-round victory/four-round bonus, enemies and R4 wave, proposed limited allied respawn and loss timing. Rewards unchanged; linked from mission catalog.
- `easy-06-proposal.json`: **unapproved candidate** for Easy M06 central 3×3 zone control (11×11 map, two cumulative uncontested round-end scores, consecutive-round subobjective, R3/R5 waves, role-based contesting AI, and time limit). Rewards unchanged; linked from mission catalog.
- `easy-05-proposal.json`: **unapproved candidate** for Easy M05 vehicle escort: 11×9 map, 9-cell route with 8 moves, 12-round limit, proximity/blockade movement checks, transport HP and 75% objective, enemy roles and R6 reinforcement; reference mission rewards unchanged.
- `easy-04-proposal.json`: **unapproved candidate** for Easy M04's four-round reactor defense (facility HP/DEF, win/defeat and 75% subgoal, two enemies plus R3 two-unit wave, role AI and map); rewards unchanged; mission catalog links to this candidate.
- `easy-03-proposal.json`: **unapproved candidate** for Easy M03 data retrieval and extraction: 11x9 map, carrier/drop/recovery state transitions, one-action terminal pickup, enemy respawn schedule, objective-driven AI, failure and one-time subgoal checks. Linked from the `easy-03` mission reward entry.
- `easy-02-proposal.json`: **proposal only**, a distinct Easy M02 boss-target encounter with two escorts, obstacle flanks, candidate enemy AI and HP/damage sanity checks. Enemy escort survival is the suggested subobjective. Linked from the `easy-02` mission entry but not ratified.
- `easy-01-proposal.json`: **proposal only**, a complete candidate for Easy M01 placement, enemy numbers, AI goals, reference builds and damage checks; **not yet approved** and not automatically merged into `missions.json`.
- `missions.json`: **90** reward entries; first-clear rewards and subobjective addon references, EXP formulas, and seven early Easy mission concepts.

## Implementation guidance

- Treat these JSON files as **design data**, not code currently executed by the site. No GameRegistry registration, UI, migrations, deployment, or rule engine changes are included.
- Use stable `id` keys, not Japanese display names, for save data and cross-file references.
- Gameplay rules must be implemented as **pure TypeScript operations** in `src/games/<confirmed-game-id>/`. Validate loaded JSON (Zod is already a dependency) and create focused unit tests.
- Keep **confirmed** values separate from **unresolved** decisions. Never treat `null`, incomplete level checkpoints, illustrative status text, or `proposed-reference` fields as finalized executable mechanics.
- For basic parts, `checkpoints` contains known Lv1/5/8/10 values (sometimes fewer). **Intermediate Lv2-4, 6-7 and Lv9 are not fully fixed**, nor is every accessory's scaling rule.
- Since the 6 equipment slots are **per robot**, identical equipment catalogs are equippable on distinct robots; each **additional-part ID may be equipped once per robot**.
- Core upgrades costs beyond the early confirmed levels are still the **latest reference proposal**, not ratified by the same explicit adoption as basic part costs.
- The 60 addon effects include some descriptive mechanics requiring the exact resolution order, cooldown and legal-target checks. Preserve their intent; turn them into explicit action/state effect models in implementation.
- Stage layouts and missions M08–M30 are **not yet individually designed**. `missions.json` is an unlock/reward and EXP plan, not fabricated level maps.
- Rarity thresholds are checked against the **weapon used for the action**, not merely any weapon carried.

## Cross-file consistency

- Core levels 1–41, CAP100–300; 3 cores.
- 6 basic equipment slots per robot (engine1 / weapons2 / armor1 / control1 / special1), extra addon parts as CAP allows.
- 46 basic parts: initial18 + Easy6 + Normal10 + Hard10 + full-clear2.
- 60 addon parts: Normal30 + Hard30; Easy subgoals give EXP only.
- 9 frame groups, 10 models; the two attack-2 models share one group and cannot coexist.
- EXP from 90 first clears and 90 subgoal first clears: **49,080**, no replays included.
- Basic-part Lv1–10 cost: **2,450 EXP**, shared across rarity; downgrade returns **50%** of spent upgrade EXP.

## Unresolved design / later implementation

Official title/gameId; complete stage data (maps, goals, enemy AI and stats); stage completion and subgoal checks; numerical checkpoints for some parts and per-level curves; effect timing/stacking/target predicates; some move geometry and edge rules; final core Lv-up EXP values. All unresolved fields must be explicitly designed rather than guessed.

## Workflow

Create gameplay implementation on a **separate feature branch** after confirming the game title/gameId and remaining rules. Validate JSON cross-references and budgets in a script/unit test first. Do not merge these design notes into production gameplay inadvertently.

Source: consolidated design decisions from the ongoing game-planning conversation, snapshot dated 2026-10-27.

## Repeatable static check

```sh
node docs/design/robot-tactics/validate.mjs
```

This verifies document presence, IDs, reference integrity, count totals and EXP math only. It **does not** prove battle mechanics or enemy balance. Run it whenever data is edited.
