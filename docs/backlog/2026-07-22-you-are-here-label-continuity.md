# "You are here" label continuity on zoom-in

`needs-design`

## The problem

The "You are here" label marks our location in the Milky Way, but it vanishes as you zoom in — exactly when a "you are here" pointer would start meaning something more specific (the Sun, then Earth). Question to design: should the label follow the descent all the way to Earth, handing off its anchor as the scale changes, instead of fading to nothing?

## Verified current state

- `src/services/engine/presentation/produceMilkyWayLabel.ts:58` — `LABEL_TEXT = 'You are here'`, produced per-frame with id `'milkyWay'`.
- Visibility is the product of two fades (`produceMilkyWayLabel.ts:83-106`):
  - **Far fade**: `milkyWayLabelAlpha(camDist)` — full at 0.6 Mpc, gone by 2.0 Mpc (`src/services/gpu/labelLayout/milkyWayLabelVisibility.ts:16-17`).
  - **Near fade (the disappearance in question)**: `fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDist)` — fully gone by 2 kpc (`scaleFadeBands.ts:60`, `goneAt: 0.002`). The label is origin-anchored COSMO-slab content, so it cannot survive inside the cosmological near plane; the fade hides it before it clips.
- The grand tour has a beat built around it: `src/data/animation/tours/grandTour/youAreHere.ts`.

## Directions to explore (design decides)

- **Scale-laddered handoff** — as `surveyDeepZoom` fades the MW-anchored label out, fade in a NEAR-slab successor anchored at the Sun, then Earth. The anchor (and possibly the text) walks down the scale ladder with the camera.
- **Re-anchor, one label** — a single label whose anchor position and slab assignment are scale-dependent; avoids two labels cross-fading but braids slab logic into the producer.
- **Status quo + Earth affordance** — keep the fade, rely on the Earth body label / home navigation to carry "here" at small scales.

## Open questions

- What does "here" point at per scale — galaxy, Sun, Earth, or the observer origin (which is the Sun already)?
- Same text all the way down, or scale-appropriate variants?
- Does the tour beat (`youAreHere.ts`) constrain the choreography?

## Related

- Home-button retarget to Earth (same "where is home" story): BACKLOG UI & UX.
- Scale-fade bands: `src/services/engine/presentation/scaleFadeBands.ts` (descent thresholds intentionally separate — memory `project_scale_fade_bands`).
