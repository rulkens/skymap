# Milky Way point-cloud follow-ups

Small knots triaged to backlog by the milky-way-point-cloud branch's T10
entanglement radar + final whole-branch review (both READY-TO-MERGE clean;
full reports lived in the branch's `.superpowers/sdd/t10-*.md`). None is
load-bearing; each is an independent cleanup.

## Items

1. **Orphaned WESL helpers + inverted parity authority** — `hash21`,
   `valueNoise2`, `raySphere`, `worldToGalactic`, `galacticToShader` in
   `src/services/gpu/shaders/lib/util.wesl` lost their last consumer with
   the MW impostor teardown (`hash21Hq` is still live via scalarVolume).
   Zero runtime cost (WESL links per entry point), but the
   `milkyWayModelMatrix` parity test now scrapes `GAL_*_EQ` from a WESL
   original whose only live user is the TS mirror — authority inverted.
   Either delete the dead helpers and make the TS constants canonical
   (moving the galactic-frame doc there), or keep the WESL as the canonical
   frame definition and say so.

2. **Star/dust record FIELD offsets triple-homed** — the per-record byte
   stride is single-homed (`GEN_RECORD_BYTES`), but the field offsets
   (stars f32x3@0 / f32x3@12 / f32x2@24; dust f32x3@0 / f32@12 / f32x3@16 /
   f32@28) are spelled independently in the app's `milkyWayCloudRenderer`,
   the tool's engine, and the `milkyWay/sprites` WESL writers. A shared offsets
   table (or a parity test in the style of `generationShaderParity`) would
   catch a reorder in any one home.

3. **`cameraBillboardBasis` mirrors `computeViewProj`'s roll math** — a
   documented verbatim copy ("must be checked against the other"), i.e. a
   must-remember-to. The original perf rationale doesn't hold (both run
   once per frame); extract the shared Rodrigues-roll helper or fold the
   basis derivation into the camera module.

4. **Inject the pick camera bind group into `pickMilkyWay`** — the pick
   pass currently re-binds `@group(0)` at the call site before the MW draw
   (regression-tested), because ring/disk picks leave their own uniforms
   bound. Passing the bind group into `pickMilkyWay(pass, cameraBg)` would
   make the dependency explicit instead of ordering-implicit.
