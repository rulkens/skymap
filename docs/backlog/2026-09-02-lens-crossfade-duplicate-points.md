# Lens crossfade handoff shows subtle duplicate points

**Reported:** 2026-09-02, user eyeball during the Sgr A* black-hole close-up landing
(branch worktree-render-black-hole).

## Symptom

While the camera crosses the black-hole fade band (~500 → 100 AU from Sgr A*),
the sky briefly shows subtle doubled points: each star/galaxy appears once from
the direct-view roster layers and once from the lensed sky-cubemap the lens quad
blends in on top. Fully outside or fully inside the band the sky is single.

## Mechanism (hypothesis, unverified)

The band crossfade alpha-blends the lens quad (showing the captured cubemap,
weak-field-deflected) over the still-drawn direct sky. During the ramp both
copies are visible at partial opacity, and the capture's deflection plus any
capture-eye offset displaces the cubemap copy by a few pixels from the direct
one — hence doubles rather than a clean brightness ramp.

## Fix directions to evaluate

- Fade the direct-view skyCapture roster layers out with the inverse of the
  band alpha inside the band, so total contribution per source stays ~1. The
  band-gated step split (`matchesLensPhase`, T14b) already distinguishes
  inside-band frame composition — a per-layer alpha ride on the same predicate
  is the natural seam.
- Alternatively gate direct roster layers hard-off above a band-alpha
  threshold and let the lens quad's own edge fade cover the transition.

## Pointers

- Band definition + alpha: `SCALE_FADE_BANDS` row for `sgr-a-star` (T7).
- Step split predicate: `src/services/engine/frame/slabs.ts` /
  `visibleSlabBodies.ts` (`matchesLensPhase`).
- Lens quad edge fade: `sgrAStarLensing/fragment.wesl` (`edgeFadeEndRs`).
