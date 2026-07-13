# General scale-fade bands — one primitive for all distance-band fades

**Status:** ready (design agreed with the user 2026-07-13; investigation evidence below)
**Area:** Rendering / presentation

## Problem

The descent from cosmic scale to Earth's surface crosses several content
"scales" that must dissolve in and out, and each crossing so far grew its
own hand-rolled smoothstep:

- `src/utils/math/milkyWayApproachFadeAlpha.ts` — MW impostor fades out
  approaching the disc (full ≥ 0.008 Mpc, gone ≤ 0.002 Mpc).
- `src/utils/scene/starCaptionFadeAlpha.ts` — star captions fade with the
  star's own distance (full ≤ 12 pc, gone ≥ 25 pc).
- The next one (zoom-to-earth plan 03 Task 13's investigation): a deep-zoom
  survey fade so the galaxy point cloud yields once local stars fill the
  near field.

Third instance = generalize. Build the crossfade primitive once; every
scale transition (including future ones like the star-field slab) becomes
a declared band, not a new mechanism.

## Agreed design

1. **`src/utils/math/fadeBand.ts`** — pure directional smoothstep.
   `FadeBand = { fullAt: number; goneAt: number }` (type in
   `src/@types/math/FadeBand.d.ts`); direction is inferred from edge
   ordering (`fullAt > goneAt` → fades out as the distance drops, and vice
   versa), so one function serves both approach-fades and recede-fades.
2. **`src/services/engine/presentation/scaleFadeBands.ts`** — a declarative
   `SCALE_FADE_BANDS` table (same pattern as `captionPriority.ts`), each row
   commenting WHICH quantity it keys on:
   - `surveyDeepZoom`: `{ fullAt: FOREGROUND_MAX_DISTANCE_MPC (~0.0103), goneAt: 0.002 }`
     — keyed on **camera distance from the heliocentric origin, Mpc**.
   - `milkyWayApproach`: `{ fullAt: 0.008, goneAt: 0.002 }` — same key.
   - `starCaption`: `{ fullAt: 12, goneAt: 25 }` — keyed on **the star's
     own distance, pc** (user chose to fold it in; the per-row quantity
     comment carries the distinction).
3. **Survey integration** (the new behavior): `pointSpritesLayer.draw`
   multiplies `fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, hypot(view.camPos))`
   into its `fadeOpacityOf` return. Distance hoisted per-frame, not
   per-source.
4. **Conversions**: `milkyWayLayer` and `foregroundLabelsLayer` switch to
   `fadeBand` + their table rows; `milkyWayApproachFadeAlpha.ts` and
   `starCaptionFadeAlpha.ts` (+ tests) are DELETED — behavioral pins move
   to `fadeBand.test.ts` (both directions, monotonic ramp, edge order).

## Investigation evidence (plan 03 Task 13, 2026-07-13)

- **Seam is singular**: per-source galaxy opacity reaches the GPU only via
  `pointSpritesLayer.ts:120`'s `fadeOpacityOf` callback, consumed solely at
  `pointRenderer.ts:782` (per-source FadeUniforms → fragment alpha; pass is
  additive so 0 → invisible). `deriveSourceMasks.ts:54` reads the RAW
  FadeRegistry opacity, so the multiply leaves draw/pick masks untouched —
  desired (source keeps drawing, fade is shader alpha, no draw-list pop).
- **Key on `Math.hypot(view.camPos…)`** (distance from the heliocentric
  render origin — already in scope, `milkyWayLayer.ts:117` precedent), NOT
  `cam.distance`, which is orbit-distance-to-focus (known landmine).
- **Band anchors, no hand-picked numbers**: outer = `FOREGROUND_MAX_DISTANCE_MPC`
  (exactly where the local starfield switches on); inner = 0.002 Mpc (the
  MW approach-fade inner edge) so survey points and the MW impostor
  dissolve together into the solar-system foreground.
- **Composition is free**: [0,1]×[0,1] multiply, nothing caches the callback
  return; the factor is spatial so camera motion's existing render-wake
  suffices — zero `shouldKeepTicking` changes.

## Folded-in from the plan 03 entanglement radar

- `EARTH_TEXTURE_MAX_DISTANCE_MPC` (`earthTextureSlot.ts`) and
  `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (`foregroundLabelsLayer.ts`) are the
  same 1e-3 literal in two homes, related only by "same order as" prose.
  When building the band table, decide: if the "captions appear ≈ texture
  starts loading" simultaneity is intended, give the descent-onset distance
  ONE home (the table is the natural place — a loading slot importing from a
  frame pass would cross layers); if independence is intended, replace the
  prose with a sentence saying so and why.

## Known non-goals / follow-ups

- **Disk sprites**: `ProceduralDiskRenderer`/`TexturedDiskRenderer` expose
  no global opacity scalar, so a very-nearby galaxy's disk (M31-class) can
  persist while its points fade. Renderer-signature change; do it only if
  the visual gate actually shows it.
- **Pick coherence**: fully-faded survey points remain pickable at deep
  zoom (draw mask untouched by design). Negligible — they sit behind the
  true-scale foreground.

## References

- Plan 03 Task 13 investigation report (session-local
  `.superpowers/sdd/task-13-report.md`) — full seam/band/composition
  evidence; superseded by this file for pickup.
- `docs/backlog/2026-07-13-star-field-own-slab.md` — a future STARS slab
  is the kind of transition that should be one more `SCALE_FADE_BANDS` row.
