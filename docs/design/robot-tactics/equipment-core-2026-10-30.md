# Equipment and CAP Core, first increment

Stacked on the adopted movement Core in PR #70. Runtime implementation:
`src/games/robot-tactics/equipment.ts`.

## Implemented from adopted catalog data

- Core levels 1–41, CAP100 + 5 per additional level, reaching CAP300 at Lv41.
- Typed access to 10 frame models, 46 basic parts and 60 addons. Initial
  availability derives from the catalogs: four frames, 18 basic parts, no addons.
  Reward/unlock progression itself is not implemented here.
- A complete six-slot loadout: engine, two weapons, armor, control, special.
  This adapter only accepts complete builds; it does not establish a new game
  rule about whether a future UI may offer empty slots. Unknown extra slots,
  wrong part categories, duplicate weapon IDs on one robot and CAP overflow fail.
- Addons have no count-based slot limit, but spend CAP; repeated IDs on one
  robot and addon levels are rejected. A caller must provide trusted unlock
  availability. The module does not trust a default "everything unlocked" list.
- Three directly controlled robots require distinct core IDs and at most one
  model from each frame group. Attack II A/B share one group. Different robots
  can equip the same weapon ID.
- Weapon levels 1–10 use the adopted neighboring-checkpoint linear
  interpolation and `Math.round` rule for power/CAP/numeric stat modifiers.
  Exact checkpoints, range, family and rarity are preserved. Penalties stored
  outside checkpoints, such as sniper MOV−1/SPD−8, are retained once.
- Effective MOV = max(1, core3 + frame modifier + equipment MOV modifiers).
  Frame movement growth steps at core Lv21. Legacy core2-inclusive frame MOV
  totals are never added to core3. The compatible mobile Lv21+ / movement engine /
  overload propulsion build reaches MOV7. No system cap is introduced.
- Movement replacement and addition choices feed the adopted movement Core;
  the union addon retains independent per-type legal-move/path-budget checks.
- Addon scope/weapon-rarity eligibility is reported per weapon slot for later
  action validation. The module does not introduce an unadopted ban on physically
  equipping a currently unusable action addon.

## Explicit limits and fail-closed gaps

`canEquip` describes equipment legality at the catalog CAP cost. It does not
mean complete combat statistics or formal mission readiness. No game registry,
React UI, storage, server, database or existing game is changed.

Non-weapon intermediate-level CAP/stat interpolation is explicitly undecided
in the source data. Only their saved checkpoints are resolved. A gap returns
`capUsed: null`, `movement: null`, `canEquip: false` and a diagnostic rather than
copying a nearby checkpoint or the old prototype's interpolation. Explicitly
null checkpoint stats, such as variable-output engine Lv1 EN/SPD, also retain
blocking diagnostics. The adapter does not invent their missing values.

The catalog provides no adopted frame-affinity CAP table. This adapter sums the
stored part/addon CAP values; it does not import discounts/surcharges from old
prototype code. General frame statistics between reference levels remain
undecided except the already adopted core HP and frame MOV rules; those combat
stats are outside this module. Addon effects beyond movement and weapon
eligibility, weapon-specific combat effects, EXP costs, owned upgrade levels,
combat actions and mission execution remain later increments.

Existing Stage Catalog guards still reject all 90 plans for formal play. This
module does not promote candidate stages, composite victories or pending boss /
objective values.

## Next design decisions for complete stat construction

- Non-weapon intermediate-level CAP and numeric stats between existing
  checkpoints: no adopted interpolation method yet.
- Frame combined melee/ranged/DEF/SPD/EN between the saved core Lv1/21/41
  totals: no adopted interpolation method yet. HP already has its own adopted
  core growth, and MOV retains the Lv21 step.
- Null endpoints remain unresolved even if a general interpolation policy is
  later adopted. Core EXP reference costs and incomplete action effects are not
  implicitly adopted by choosing stat interpolation.

## Verification

- Strict TypeScript check of affected Core and test files.
- Equipment Unit/smoke: 16 tests, including all 460 basic part/level plans and
  the four initial frame builds connected to adopted movement geometry.
- Movement 43 + movement smoke 1 + Stage Catalog 5: regression coverage retained.
- Total targeted suite: 65 tests. Movement smoke covers 1,080 catalog queries.
- No UI/build/migration/Windows total suite is required for this isolated,
  unwired game Core increment; GitHub Actions retain their configured checks.
- No merge or production deployment is authorized or performed.
