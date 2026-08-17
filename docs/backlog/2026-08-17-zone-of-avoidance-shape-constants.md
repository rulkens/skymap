# Zone-of-avoidance shape constants scattered + four same-typed positional args

**Area:** rendering / zone-of-avoidance · **Readiness:** needs-design

The band's shape lives across three files with nothing tying them together:

- `src/services/engine/frame/passes/zoneOfAvoidanceLayer.ts:17-20` —
  `INNER_RADIUS_MPC = 3`, `OUTER_RADIUS_MPC = 380`, `BULGE_DEG = 10`,
  `ANTICENTER_DEG = 3`.
- `src/services/engine/frame/passes/zoneOfAvoidanceUpsampleLayer.ts:17` —
  `LABEL_RADIUS_MPC = 40`.
- `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts:57` —
  `LABEL_EM_MPC = 2`.

The four shell-shape numbers then travel as **four adjacent, same-typed
positional `number` arguments** through `draw`, `drawPick` and
`writeUniforms` on `zoneOfAvoidanceRenderer.ts` (and both signatures in
`ZoneOfAvoidanceRenderer.d.ts`). `bulgeDeg` and `anticenterDeg` sit next to
each other, both degrees, both plausible in each other's slot — swapping
them at a call site type-checks and produces a band that looks wrong rather
than fails to compile.

The same numbers are re-narrated as prose in other files, and one narration
has already drifted: `defaults.ts:250` documents the shell's radial span as
"currently ~377 Mpc" (`380 - 3`, correctly derived from the two consts
above, but restated rather than computed), while
`zoneOfAvoidanceRenderer.ts:53` cites `LABEL_RADIUS_MPC` as living
"alongside... in `zoneOfAvoidanceLayer.ts`" — it actually lives in
`zoneOfAvoidanceUpsampleLayer.ts`. Nothing catches a comment pointing at the
wrong file.

## The label em-height/radius coupling

`LABEL_RADIUS_MPC` (how far out the lettering sits) and `LABEL_EM_MPC` (how
tall each glyph is, in Mpc of world space) express a joint claim — the
labels read at a legible width relative to the band they annotate — but the
two factors live in different modules: one baked into an immutable GPU
buffer at construction (`LABEL_EM_MPC`), one passed per frame
(`LABEL_RADIUS_MPC`). Wiring `labelRadius` to a settings slider (the obvious
next tuning step, since the shell's other look-knobs are already
slider-driven) would change the apparent scale of the text with nothing
re-deriving the em-height to match — a silent visual break, not a compile
error.

## Direction

- One `ZONE_OF_AVOIDANCE_SHELL` record (in `src/data/zoneOfAvoidance/`,
  alongside the existing tuning-defaults/slider-fields modules) holding all
  five shape numbers, passed as a single object into `draw`/`drawPick`/
  `writeUniforms` instead of four positional args. Removes the swap hazard
  and gives the re-narrations one thing to `import` instead of restate.
- Express the label's em-height as an **arc angle** rather than a fixed Mpc
  height, so it is radius-invariant: if `labelRadius` ever becomes tunable,
  the apparent glyph size stays constant by construction instead of by
  convention.
