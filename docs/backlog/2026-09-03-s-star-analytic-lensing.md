# S-stars are not lensed by Sgr A\* — analytic finite-distance images

**Reported:** 2026-09-02, user eyeball after #645 landed. Investigated and
prototyped 2026-09-03 on branch `worktree-s-star-analytic-lensing` (PR #657,
closed unmerged, branch kept). User ruling: not now.

## What is wrong on main today

1. **The S-stars never enter the sky cubemap.** `starPointsLayer` carries
   `skyCapture: true`, but each capture face's synthetic pose uses a placeholder
   `distance: 1` (Mpc) to land the eye (`skyCubemapFaceContext.ts`), and the
   layer's `ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC` gate (~0.23 Mpc)
   rejects it on every face. So the lens pass shows no S-star behind the hole,
   contradicting the grill ruling that "a star sweeping behind the hole still
   doubles/rings". No other roster layer reads `cam.distance` (verified), so the
   placeholder harms only this row.
2. **Even captured, the cubemap is the wrong model for them.** It is an
   at-infinity capture from a pinned eye. In the lens band the camera is
   100–500 AU from Sgr A\* and the S-stars 120–1900 AU, so source and observer
   distances are comparable. Finite-distance Einstein radius
   θ_E² = 2 r_s D_ls / (D_l D_s): at 300 AU camera / 300 AU behind, 0.017 rad
   vs 0.024 at infinity (ring ~40% too big). Parallax before a re-sweep (3% of
   GC distance) is degrees. Galaxies and the Gaia stream are kpc away, where
   at-infinity holds to texel precision.

## What the branch built (reusable as-is, all tested)

- `src/utils/physics/lensPointSource.ts` — images of a point source: solves
  β = θ − (D_ls/D_s)·α(D_l θ) by bisection on the EXACT Schwarzschild bending
  angle (same table as the lens pass, sampled through
  `src/utils/lensing/sampleSchwarzschildDeflection.ts`, 4096 samples built
  lazily on first band entry, ~25 ms). Primary + secondary, magnification from
  the numerical derivative, → 0 continuously at the shadow (no cull needed).
  Weak-field first version popped at the rim because 2/b keeps the secondary
  bright to the photon sphere.
- `src/services/engine/frame/sStarLensedImages.ts` + `passes/sStarLensedImagesLayer.ts`
  — hdr / NEAR0 / additive / `hdrPostLensing: true` (must draw AFTER the lens
  `over` blend or the disc wipes it). Own `StarPointRenderer` instance: `setStars`
  is a `writeBuffer`, last write wins per submit. `starPointsLayer` drops the
  S-stars while band alpha > 0 (hard swap; at 500 AU the primary is hundredths
  of a degree off the anchor). `skyCapture` removed from star-points.
- Shared pieces extracted: `sgrAStarLensBandAlpha.ts`, `starPointDrawParams.ts`,
  `criticalImpactParamRs.ts`, `src/data/bodies/sgrAStarSchwarzschildRadiusMpc.ts`
  (r_s in Mpc must live in data — `oneMpcSeam.test.ts` bars engine body-slab
  files from `SCALE_UNITS.M_TO_MPC`).
- Pick stays on the true anchor (18 px footprint dwarfs the deflection).

## Why it was parked: the images don't look right yet

- **Brightness is binary.** Apparent magnitude at 300 AU: S2 ≈ −22, S301 ≈ −17.
  Every image is 10⁶–10¹⁰ above the tone-map's white, so the 9-mag spread and
  the 3.5-mag range contrast both vanish into identical white dots. Two causes:
  the star-point shader freezes 1/d² below `MIN_D2_MPC2` (0.1 pc), and nothing
  adapts exposure.
- **Flux-preserving glare growth alone fails** (measured, reverted): r ∝
  √(peak/white) pins all 40 stars to `STAR_GLOW_MAX_PX` and also grows Sirius
  to ~40 px from Earth, since the field already sits ~10³ over white and only
  the knee hides it.
- **Zooming out is a point mess.** The images stay at full brightness while the
  camera pulls back from the hole, so the whole Sgr A\* area reads as a clutter
  of white points until the band alpha finally fades the layer out at 500 AU.
  Same over-exposure root cause: with real inverse-square dimming and an
  exposure anchored to the scene, the cluster would dim and tighten on the way
  out instead of holding as saturated dots.
- Glare must stay ROUND: it is the observer's PSF applied after deflection.
  Tangential stretch applies to the stellar disc (~2×10⁻⁵ rad), visible only
  within ~0.01 θ_E of the axis.

## What landing needs

1. **Adaptive exposure in the images layer** (design agreed, not built): restore
   true 1/d² on the CPU (compensate the 0.1 pc floor in magnitude space), shift
   all images so the brightest sits at one anchor magnitude (one constant,
   tuned by eye); a per-draw `glareThreshold` uniform on the star-point shader
   enabling flux-preserving radius growth above it — star-points passes 0
   (field untouched), the images layer passes the knee. ~1 uniform + ~10 shader
   lines + ~30 CPU lines.
2. User visual verdict at 100–500 AU: single S-stars (no unlensed duplicate),
   a secondary that thins smoothly into the shadow, invisible band-edge
   handoff, plausible size ordering.
3. Paired perf A/B on `sgr-a-star-lens` (branch never measured).
4. Decide the placeholder-pose landmine: leave (nothing else reads it) or set a
   real small distance.
5. Interplay with `2026-09-02-lens-crossfade-duplicate-points.md`: that item
   fades the direct roster; this one hard-swaps the S-stars. Keep them agreeing.

## Follow-on once S-stars are off the cubemap

**Freeze the cubemap.** With only kpc-scale content on the roster, one 6-face
sweep on band entry / reallocation is texel-exact for the whole band (1024²
face texel ≈ 1.5 mrad; a texel of parallax at 8 kpc needs ~12 pc of camera
travel). Delete the 2 s staleness valve, the camera-move fraction knob and its
settings row, the per-frame round-robin, and pinned-eye tracking; keep the
full-sweep path. Accept stale roster-toggle-in-band or key on a few booleans.
Paired A/B on `sgr-a-star-lens` expected to drop one face render per frame.

## Cheaper wrong fix, for the record

Making the capture pose distance real (or skipping the gate in capture) puts
the S-stars into the cubemap at infinity: visible, but the ring is ~40% too
big and images lag the camera by degrees between sweeps.
