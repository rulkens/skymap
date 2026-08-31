# Filaments and flow field lack scale fade bands

## The problem

The cosmic-web filament skeleton and the CF4++ flow-field ribbons stay at full
opacity no matter how far the camera descends into a galaxy or the solar
system — every other cosmic-scale overlay (survey point clouds, structure
markers, the Milky-Way label) yields via a declared row in `SCALE_FADE_BANDS`
as the camera passes its relevant scale. These two never got one, so zooming
in past their working scale leaves lines/ribbons hanging in front of local
content instead of dissolving out like their siblings.

## Verified current state

- `src/services/engine/presentation/scaleFadeBands.ts` holds `SCALE_FADE_BANDS`,
  the declarative per-asset scale-visibility registry consumed via
  `fadeBand(band, value)` (`src/utils/math/fadeBand.ts`). Existing rows:
  `surveyDeepZoom`, `milkyWayApproachSun`, `starCaption`, `starBackdrop`,
  `bodyGlintBackdrop`, `sunCaption`, `constellations`, `bodyGlint`.
- `src/services/engine/frame/passes/filamentsLayer.ts:81-90` — `enabled()`
  reads only `state.settings.filaments.enabled` (plus the fade-out tail via
  `state.subsystems.fades.opacityOf`); no scale term at all.
- `src/services/engine/frame/passes/flowFieldLayer.ts:42-50` — same shape:
  `enabled()` reads `slotReady(state.assetSlots.flow)` and
  `state.settings.flow.enabled`; no scale term.
- The flow field (CF4++ peculiar-velocity cube) is roughly **1000 Mpc across**
  — its band needs to hold full opacity out to large camera distances and
  only fade once the camera has descended well below that, unlike the
  ~kpc-scale bands tuned for survey/Milky-Way content.
- Filaments follow the 2MRS+GLADE DisPerSE reconstruction's extent (see
  `project_sdss_wedge_confirmed` — 2MRS+GLADE-only is the DisPerSE default),
  so their band scales with that catalog depth, not the flow cube's.

## Fix

Add two rows to `SCALE_FADE_BANDS` (keyed on camera distance from the
heliocentric render origin, Mpc, like `surveyDeepZoom`/`starBackdrop`) and
wire each layer's `enabled()` to call `fadeBand(...)` and gate on the result
being nonzero, per the "opacity 0 ⇒ no render" house rule (memory
`feedback_opacity_zero_no_render`): gate at `enabled()`, not at `draw`. Follow
the existing `filamentsLayer`/`flowFieldLayer` pattern of ORing the scale
fade with the live opacity-tail check so an in-progress fade-out keeps
drawing. Band edges are an eye-tuning starting point, same as the other rows
in the table.
