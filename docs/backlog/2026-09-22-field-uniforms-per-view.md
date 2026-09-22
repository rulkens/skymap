# Analytic MW field uniforms pack their own camera, not a view slot

**Raised:** 2026-09-22, per-view planning prep (`docs/superpowers/plans/2026-09-22-per-view-planning-prep.md`
Task 7). Not touched by that prep — the v2 analytic field is not on the
frame program yet ("Milky Way smooth field" in the project's active efforts).

`packFieldHeaderUniforms` (`src/services/gpu/renderers/galaxyField/field/packFieldUniforms.ts`)
packs its own camera basis (`eye`, `camRight`/`camUp`/`camFwd`, `tanHalfFov`,
`aspect`, `lensShiftX`) straight from an `OrbitCamera`, independent of the
shared `CameraUniforms` prefix (`src/services/gpu/lib/cameraUniforms.ts`)
every other renderer now writes through. `fieldSplat/vertex.wesl`
(`src/services/gpu/shaders/milkyWay/field/fieldSplat/vertex.wesl`) reads
that private uniform and reconstructs NDC itself (`splatNdc`) — the same
pattern `worldLenToPx` had before this prep gave it `pxPerRad`.

## Why it matters

A dome face or a VR eye has no single `OrbitCamera` to pack from — the
field's silhouette-quad billboarding needs the same per-view treatment
`worldLenToPx` and the Milky Way sprite basis just got. Left as-is, the v2
field ships a sixth special case the day it joins the frame order.

## Fix shape

Fold `packFieldHeaderUniforms`'s camera fields into the shared per-view
uniform before the v2 field's frame-order PR, so `fieldSplat/vertex.wesl`
reads the same prefix every other shader does.
