# User-provided VFX pack v1

Source: `robot_tactics_vfx_pack_v1.zip`, supplied 2026-11-03.
All 21 effects and the original manifest are registered. Each PNG here is a
lossless horizontal atlas: six original 256×256 RGBA frames, 00 through 05,
left to right (1536×256). All 126 frame pixel buffers were compared with the
ZIP originals. No references, contact sheets or preview HTML are shipped.

Manifest per-effect frameDurationMs overrides the general FPS recommendation.
Attack/hit/destruction/cues play once. Status overlays follow the actual active
Core effect and loop only while it exists. Transient healing uses one cycle.
Atlas URLs are explicitly inlined by Vite; no network or service worker is needed.

The source README warns that automatic background removal can leave alpha-edge
ghosts. The approved pixels are preserved; unit bodies, HP, selection and damage
numbers are rendered above effects. Animation respects reduced-motion, options,
backgrounding, reload and screen disposal.

Source ZIP SHA-256: `e1fc8e97e340f0370245046012d894ea125719f556ceb5592943928c93a1e720`.
