# f32 half-ulp sightline nudge at the body-arm flip

**Raised:** 2026-09-10/11, wave-end fixes on PR #647
(`.superpowers/sdd/2026-09-01-camera-pivot/tilt-band-fix-report.md` concern 1).
User ruled: backlog, not this PR. Pre-existing, not introduced by this branch.

At most start altitudes, converting a pose across the absolute↔body-fixed flip
(`toBodyArm`, `src/services/engine/camera/poseFrameConversion.ts`) reproduces
the input pitch to ~4e-13. In two narrow windows of start `h/R` — measured at
≈ 0.800–0.805 and ≈ 0.8775–0.878 on the 0.45/0.9 tilt band — the round-tripped
pitch is off by exactly 1.490e-8 or 2.107e-8 rad: `2^-26` and `2^-26·√2`,
half-ulp quantities for a float32 in `[0.25, 0.5)`. That points at a
`Float32Array` intermediate somewhere on the flip path (`wgpu-matrix` defaults
to `Float32Array`).

## Observable

The eye position is bit-identical across the flip in every case measured — the
only observable is a ~4 mas sightline nudge on the one frame the flip occurs.
Confirmed **not** the Pop-2 bug `tests/services/engine/frame/poseFold.test.ts`
guards, and not introduced by the camera-pivot branch; it is the reason that
test's start fraction is pinned at `SURFACE_REGIME.disengageHR * 0.9` rather
than `* 0.975` (the closer fraction lands in one of the two knife-edge
windows and fails the test's `1e-9` continuity bound at `2.0e-8`).

## Fix shape

Needs verification before a fix: identify which `wgpu-matrix` call on the
`toBodyArm`/flip path routes through a `Float32Array` intermediate rather than
staying f64 end to end, and replace it with an f64-safe equivalent (or accept
the residual explicitly if none exists at reasonable cost). Not urgent — the
nudge is sub-mas and momentary — but worth confirming the exact call site
before deciding whether it is fixable cheaply.
