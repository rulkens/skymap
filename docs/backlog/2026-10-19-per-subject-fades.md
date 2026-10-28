# Per-subject fades: label distance and apparent size

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, [grill session](../grill-sessions/layer-scale-bands-2026-10-18.md) Q2/Q4. The Layer-declared `bands` (kind 1, the camera's distance from a fixed point) shipped; these two kinds were deliberately left out and the shape was built so each is one new tag, not a reshape.

## Kind 2: per-label distance

The star, Sun and Sgr A\* captions fade with each caption's own distance from the camera, a different number per label. Core applies them today in `CAPTION_FADE_RULES` (`captionFadeRules.ts`) with the core rows `starCaption`, `sunCaption`, `sgrAStarCaption`. The `constellation` caption is producer-supplied, and `ForegroundCaption.revealBand` already exists (mesh bodies stamp it).

Direction: a `from: 'anchor'` value on label entries only, evaluated per label in the director loop (`label2DDirector.ts`, where emphasis is already applied per label), so a Layer declares the window in `visibility.ts` and core applies it.

## Kind 3: apparent size in px

Famous-galaxy labels (`produceFamousGalaxyLabels.ts`), structure rings' `markerMinApparent*`, core's `bodyGlint`, and the Milky Way's `milkyWayFadeAlpha`. Direction: a measurement tag on the band (apparent px).

Greenfield note: both kinds vary per subject inside one item, so a resolved number cannot be handed in. The consumer needs the band's edges, and core hands those instead (`bandValueOf` returns a value; a per-subject kind returns the declared edges for the consumer to evaluate at its own subject).

## First prep: L1, one camera-relative label frame

Kind 2 needs a label's camera distance to be one expression for every label. NEAR0 producers emit camera-relative `worldPos` (`near0LabelProjection` rebases on `drawCamPos`; load-bearing for f32 precision at solar-system zoom). COSMO producers (famous galaxies, the Milky Way label, cosmic structure labels) emit absolute positions (`cosmoLabelProjection` passes `ctx.vp`), by history only. L1 unifies them: the three COSMO producers and `cosmoLabelProjection` follow NEAR0's rebase, so a label's camera distance is always `|worldPos|`. It touches two producers that lift through `ctx.vp` themselves, and it should be a pixel-identical refactor in its own commit.
