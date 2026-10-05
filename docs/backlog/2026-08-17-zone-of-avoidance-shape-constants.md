# ZoA label em-height not radius-invariant

**Area:** rendering / zone-of-avoidance · **Readiness:** needs-design

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

Express the label's em-height as an **arc angle** rather than a fixed Mpc
height, so it is radius-invariant: if `labelRadius` ever becomes tunable,
the apparent glyph size stays constant by construction instead of by
convention.
