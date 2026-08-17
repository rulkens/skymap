# Scale-gated demand: don't fetch assets invisible at the current scale

## The problem

Boot fetches every asset whose settings toggle is on, regardless of whether
anything on screen at the current camera distance would actually draw it.
At the Earth boot view this means tens of megabytes download to paint
nothing.

## Verified current state

- Boot at default settings, tier `medium`, downloads roughly 101.7 MB:
  `stars-medium.bin` 30.0 MB, `glade-medium.bin` 26.3 MB, `mcpm-medium.scfd`
  19.4 MB, `milliquas-medium.bin` 12.8 MB, `sdss-medium.bin` 10.1 MB,
  `2mrs.bin` 2.5 MB, plus small sidecars. At tier `large` the same set is
  roughly 420 MB.
- `src/services/engine/wiring/assetWiring.ts` demand predicates for the
  galaxy/star catalog rows key only on the settings toggle (e.g. line 121
  `ctx.settings.galaxyCatalogs.items[id]?.enabled === true`) — no scale
  term anywhere in the demand function for glade, sdss, milliquas, stars,
  or the mcpm volume.
- At the Earth boot view, the `surveyDeepZoom` band
  (`src/services/engine/presentation/scaleFadeBands.ts:66`,
  `{ fullAt: FOREGROUND_MAX_DISTANCE_MPC, goneAt: 0.002 }`) is fully faded
  to zero below 0.002 Mpc, and boot starts well inside that. So glade, sdss,
  milliquas, and the mcpm volume render nothing at boot, yet all fetch at
  boot — roughly 68 MB downloaded to draw nothing.

## Fix

Add a scale-gate term to the demand predicate in
`src/services/engine/wiring/assetWiring.ts` so an asset whose
`SCALE_FADE_BANDS` row says it is invisible at the current camera distance
does not demand yet; it loads once the camera approaches its band. This
would cut boot from ~101.7 MB to roughly ~33 MB.

## Open design question

Gate on band ENTRY or band APPROACH-with-hysteresis:

- **Entry** — demand fires the moment the camera crosses into the band's
  visible range. Simple, but structure pops in visibly when zooming out
  fast past the crossing, since the fetch+decode+upload latency is now
  exposed inside the user's motion instead of hidden before boot.
- **Approach with hysteresis** — demand fires some margin before the band's
  edge, so the fetch latency hides inside the existing fade-in window.
  Needs the hysteresis margin designed per asset (how far out is "enough
  lead time" for a multi-MB catalog on a real connection).

Body textures already have an equivalent via their proximity-demand +
release gate (`assetWiring.ts`, the textured-body rows). There is no
fallback there for a 26 MB galaxy catalog the way body textures will have a
low-res fallback atlas — so a gate that's too tight leaves a visible pop
with nothing to show in the meantime, unlike bodies where the low-res atlas
covers the gap.

## Sequencing

Deliberately sequenced AFTER the boot load-priority scheduler work (bounded
priority queue + static per-row rank + low-res body texture atlas). The two
compose: the scheduler reorders what gets fetched first, this gate reduces
what gets fetched at all. See also
[`2026-07-24-filaments-flow-scale-bands.md`](2026-07-24-filaments-flow-scale-bands.md) —
filaments and flow need `SCALE_FADE_BANDS` rows of their own before they can
participate in this gate.
