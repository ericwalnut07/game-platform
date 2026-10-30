# Equipment, growth and CAP Core

Runtime: `src/games/robot-tactics/equipment.ts`, `growth.ts`,
`equipmentEffects.ts`. This increment integrates the adopted design PR #72,
commit `ecdd2073d4684f2f67665dd507fd43341af80305`, into implementation PR #71.

## Integration and sources

PR #72 is based on design PR #63, while PR #71 builds on #69/#70. The three-way
integration preserves #70's adopted movement reference and corner/path rules.
All 46 part records exactly match PR #72's numeric source, and all ten frame
tables retain its updated inclusive HP totals. Additional metadata records the
user's separate adoption of interpolation for non-HP/MOV frame totals.

The new core HP checkpoints are **45/72/105/137/170** at Lv1/11/21/31/41.
Initial non-weapon 12 + reward non-weapon 12 + reward weapon 6 = 30 revised
parts. Existing CAP anchors, EXP, slots, acquisition and equipment conditions
are unchanged. The eight new Lv8 CAP anchors come from PR #72, not a new
balance adjustment. No old benchmark numbers are used as runtime defaults.

## Implemented

- Core CAP100 + 5 per level, reaching CAP300 at Lv41; basic-part upgrade EXP
  remains 80/120/170/235/275/330/360/415/465 (total 2,450).
- Initial four frames / 18 basic parts derive from the source catalogs. Ten
  frames, 46 basic parts and 60 addons remain available to the planning API.
- Complete six-slot equipment checks, explicit trusted unlock availability,
  duplicate weapon/addon rejection, no addon levels, CAP and slot validation,
  three distinct core IDs and one model per frame group. The adapter's complete
  build input does not introduce a new game rule about future empty-slot UI.
- All basic parts now interpolate between Lv1/5/8/10. Integer CAP, power,
  modifiers and numeric EN/recovery effects use Math.round (signed half toward
  positive infinity). Null endpoints stay unresolved, not zero.
- Fixed modifiers are retained. PR #72's new Lv8 entries omit the unchanged
  advanced mobility engine MOV+1 and limit control EN−15; the resolver inherits
  a numeric modifier only when both outer anchors and every explicit occurrence
  agree on that fixed value. The canonical JSON is not rewritten to alter them.
- Frame melee/ranged/DEF/SPD/EN totals interpolate between Lv1/21/41. These
  totals already include core stats and are not added to core stats again.
- Core HP follows its own five-point curve. All ten frame HP anchors are exact.
  Frame-only HP bonuses interpolate separately from the core at intermediate
  levels, so attack I Lv11 HP75 and Lv31 HP140 preserve core growth. Attack I
  Lv41 + standard armor Lv10 is **HP207**, with no double core HP addition.
- Effective MOV keeps core3 + the frame's Lv21 step + equipment modifiers,
  minimum one. Movement replacement/addition and the compatible MOV7 build
  retain the adopted per-type legal-route union; no type borrows another's budget.
- Shield support uses fractional interpolation and multiplicative reduction
  after the base 45% shield. Combat factors remain fractional. Display reduction
  rounds to two decimal percentage points with a binary half-point correction.
- Boost support stays at extra-move distance four; EN40/35/30/25 by checkpoint,
  integer-interpolated between them. It does not add four to ordinary MOV.
- Storage and passive regeneration provide their adopted extra EN recovery;
  stationary armor repair provides HP recovery. Extra movement counts as moving,
  maxima cap recovery, and defeated units are not revived. The recovery helper
  applies equipment extras after ordinary action/charge recovery; it does not
  grant ordinary recovery twice.

`baseStatsBeforeAddons` exposes core/frame/basic equipment statistics. It does
not apply addon multipliers or claim complete combat readiness. `canEquip` is
an equipment legality result, separate from unresolved base-stat diagnostics.
Addon scope/rarity reports eligible weapon slots for the later action layer,
without inventing a ban on equipping an inactive addon. Addons remain level-free.

## Frame HP bonus growth adopted on 2026-10-30

The user adopted interpolation of the frame-only HP bonus. At each saved
Lv1/21/41 inclusive frame anchor, subtract the matching core HP first. Interpolate
that bonus and Math.round it, then add the current-level core HP once.
This preserves both the five-point core HP curve and all inclusive frame anchors.

Defense I's bonuses remain 18/33/37. At core Lv11, HP = core72 + bonus26 = 98;
at Lv31, HP = core137 + bonus35 = 172. Defense II Lv11 HP88, mobile II HP77 and
all-rounder HP80 are also checked. All ten frames now resolve HP at all 41 levels.
No new HP anchor, equipment balance, EXP/CAP or MOV adjustment is introduced.

## Scope and verification

- Strict TypeScript: affected Core and tests PASS.
- Targeted Vitest: equipment 16 + growth/effects 41 + movement 43 + movement
  smoke 1 + Stage Catalog 5 = **106 tests PASS**.
- All 460 part/level settings resolve; 410 frame/level plans check all seven resolved
  statistics, including the adopted frame-only HP bonus interpolation. All changed anchors, six weapon tables, HP207, signed/null
  interpolation, fixed modifiers, EXP/CAP, shield/boost/recovery are covered.
- Movement smoke retains 1,080 queries over 90 plans; formal stage guards remain.
- Source audit: exactly 30 revised parts; canonical part/frame numeric records,
  all legacy CAP anchors, EXP, acquisition and slots preserved.
- PR #66's independent playtest is not integrated or updated here. Its old
  balance/prototype behavior must not be treated as this formal Core's result;
  it needs explicit updating if later brought into implementation scope.
- No UI/registry/server/storage/DB change. Local build/UI/E2E/migration/Windows
  total verification is outside this isolated unwired Core change. GitHub
  Actions retain their configured additional checks.
- EXP purchase/refund state, addon combat modifiers, attacks/formations/AI and
  mission execution are later increments. No merge or production deploy.
