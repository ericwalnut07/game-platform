# VFX pack v1 integration — 2026-11-03

Base: PR #94 `939a0fad9a1bd49eb828620a3318c5e0e2ea771b`.
Latest main `285a71ad53621671a483e030897dad3ef0979431`, AGENTS.md and
#80–#94 dependency chain reviewed. Dedicated stacked branch; no merge/deploy.

## Rendering

All 21 supplied animations / 126 frames are registered as lossless atlases.
The original manifest supplies each frame duration. The offline build embeds
all images in its single HTML, including file://; reference sheets are omitted.

Six normal weapon families use their committed receipt. Positive damage adds
light/heavy impact by target class. The final damaging receipt for a defeated
entity adds small/large destruction; shared facilities still have one damage
number. Simultaneous targets retain their pulse; later pulses start 160ms apart.
The NPC presentation delay covers the final frame without changing Core order,
damage, costs, outcomes or saved state. Player input remains available.

Core observation projects shield/defend/command defense buffs, command attack
buffs, corrosion DEF debuff and observed HP recovery. Persistent effects expire
with Core state. Existing M30 command and pickup/transmit operations are mapped
from typed state; no parsing of summary text. The bridge also maps existing
line/delta/pincer receipts to link_attack.

Units, HP, selection and all damage numbers paint above VFX. FX do not intercept
pointer events. Landscape phones use a map plus right-side controls and a
closer initial camera. Options, backgrounding and disposal cancel transient
FX; reload never replays the latest receipt. Reduced motion keeps static status
indicators and omits transient playback. Unknown special actions retain the
existing vector fallback.

## Availability boundaries

Formal production departure remains M01 only, exactly as #94. Link activation,
M16/M22 commands and M30 formal departure are not unlocked by this change.
link_attack / defense_order / artillery_order / supreme_order / data_pickup /
data_transmit are registered and connected to existing typed receipt/state
projections where supplied; production availability follows later runtime work.
M30 supreme command and data acquisition/transmission are covered through real
Core commits in tests, not claimed as a playable formal M30 mission.
DOT has no connected Core lifecycle and remains asset-only. No new DOT, heal,
buff or skill rules are invented. M02/M09/M27 have no dedicated supplied command
sprite; their existing display is retained.

## Verification

Strict game/app/test typecheck PASS. All robot Unit tests: 739 / 49 files PASS,
including 11 VFX tests. Main, battle fixture, weapon fixture and Node controller
builds PASS. Original PNG pixel comparison: 126/126 PASS.

CI extends existing robot-only suites with exact frame/timing, layer order,
inline images, pause/reload/reduced-motion and landscape checks. Formal M01
uses ordinary equipment/map operations and records attack, impact and defeat
while verifying R5 victory, EXP80 and reload; no HP/EN/position injection.
Screenshots are uploaded for visual review. Browser result is recorded in PR.

Windows ericwalnut is offline. Local browser installation is unavailable;
GitHub Actions provides browser verification. Other games, shared networking,
D1, migrations, installation format and deployment are outside this change.
