# The Milky Way impostor's approach fade is keyed on the Sun, so it never fires at the Galactic Centre

`needs-design` · Rendering · filed 2026-07-31, from a user visual pass at the GC

## What it is

The impostor is blown out at the Galactic Centre. Not a fade being overwhelmed
by exposure — the fade never starts.

`SCALE_FADE_BANDS.milkyWayApproach` (`scaleFadeBands.ts:101`) is
`{ fullAt: 0.002, goneAt: 0.0002 }` — 2 kpc to 200 pc — and is evaluated against
`Math.hypot(ctx.drawCamPos)` in `milkyWayCloudLiveness.ts:72,75`: the camera's
distance from the **heliocentric render origin**. Its own comment states the one
approach it was tuned for: "fades out as the camera dives into the disc **toward
the Sun**."

Standing at the Galactic Centre you are R₀ = 8.178 kpc from the Sun, **4× beyond
`fullAt`**, so the band returns 1.0.

## Evidence

Total alpha (approach band × apparent-size band) for a camera on the Sun→Sgr A\*
line, at a distance D from the black hole:

| D from Sgr A\* | camera dist from Sun | approach fade | apparent-size fade | total |
| -------------- | -------------------- | ------------- | ------------------ | ----- |
| 1 kpc          | 7.178 kpc            | 1.000         | 1.000              | 1.000 |
| 100 pc         | 8.078 kpc            | 1.000         | 1.000              | 1.000 |
| 1 pc           | 8.177 kpc            | 1.000         | 1.000              | 1.000 |
| 10 mpc         | 8.178 kpc            | 1.000         | 1.000              | 1.000 |

Full brightness, inside the densest part of the cloud, all the way to the
horizon scale. Nothing downstream can turn it down.

## Ruled out — do not re-chase these

The regression was first blamed on the half-res aggregate split (#521) landing
in the same merge. Both mechanisms were checked and neither is the cause:

- **The half-res split is energy-neutral.** `milkyWayCloud/stars.wesl:139` sets
  `clampFluxScale = invK * invK`, conserving flux across the sprite px clamp in
  BOTH directions — explicitly, per its own comment, to "cancel the inflation
  the floor would otherwise hand the entire far field". `starPxMin` now being
  stated in half-res target pixels does not brighten anything.
- **The fade math did not change in #521.** `scaleFadeBands.ts`,
  `milkyWayVisible.ts`, `milkyWayFadeAlpha.ts` and `MILKY_WAY_FADE_FULL_PX` /
  `MILKY_WAY_FADE_GONE_PX` are byte-identical across that merge.
- **`starCount` decoupling from tier does not bite at boot.** `tierSlice` boots
  hard-coded to `'medium'` and every change routes through `requestTier` →
  `watchTierSaga`, which re-seeds from `MILKY_WAY_STARS_PER_TIER`.

## Why it went unnoticed until now

The band was eye-tuned against ONE approach — the descent toward the Sun — and
every Milky Way pipeline change since, the half-res aggregate split included,
was visually validated against that same approach. The GC is a second approach
no gate has ever been checked against. The S-star feature is what makes flying
there worth doing, which is why it surfaced now.

## The shape of a fix

Key the band on distance to the **nearest `BODY_REGIONS` anchor** rather than to
the render origin. `regionRelativeDistanceMpc` already computes anchor-relative
distance. Near the Sun the nearest anchor IS the Sun, so today's calibration is
reproduced bit-for-bit; at the GC it becomes Sgr A\* and the band finally fires.
One term, no second special case, and it starts working for any region seeded
later.

**The open question is the edges, not the mechanism.** 200 pc is the right
hand-off near the Sun because the Gaia catalog takes over there
(`gaia-stars crossfadePc`). At the GC nothing replaces the impostor at 200 pc —
the S-stars are milliparsec-scale and Gaia's bulge coverage is heavily
extincted — so a shared pair of edges would dissolve the cloud into an empty
gap. That likely makes the band per-region (a field on `BodyRegion`), which is
machinery worth adding only once the Milky Way rendering itself is settled.

## Sequencing

Deliberately **not** fixed in the S-star branch (user's call, 2026-07-31): no
new machinery until the Milky Way rendering is sorted, and the fix lands in its
own PR off `main`. `worktree-s-star-orbits` never touched `milkyWayApproach` —
its `scaleFadeBands` diff is the `sgrAStarCaption` row plus the region-derived
backdrop bands — so PR #528 neither caused this nor is blocked by it.

## Why this is not folded into the camera-distance item

[`2026-07-30-camera-target-vs-origin-distance-gates`](2026-07-30-camera-target-vs-origin-distance-gates.md)
is the same family but a different defect. There, gates are _derived_ from
origin distance and _read_ against `ctx.cam.distance` (a target-relative
radius) — a mismatch between derivation and consumption, explicitly benign
today. Here the band is derived and read consistently against origin distance
with no mismatch at all; it simply asks the wrong question ("how close am I to
the Sun?" instead of "how close am I to whatever I am approaching?"). That one
records a decision; this one is a live visual bug, and folding it in would bury
it. Worth fixing together in one sweep of the origin-keyed gates.
