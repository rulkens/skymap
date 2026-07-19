# Photoreal-Earth follow-ups (post plans A–E)

Drift-trap knots surfaced by the entanglement-radar passes over the
photoreal-Earth feature branch (plans A–E, PR #453) and triaged by the final
whole-plan reviews as **backlog, not blockers**. Everything here is
agree-by-construction or dead-code-safe today; each item removes a
hand-synchronized mirror before it can drift.

## 1. Shared per-frame atmosphere-pose derivation (E7-A, med-high)

`encodeAtmosphereSkyView.ts` (compute prelude) and `atmosphereShellLayer.ts`
(draw) each derive `camLocal`, `sunDirLocal`, and the atmosphere-top scale from
the same inputs (`ctx.drawCamPos`, `bodies.earth`, `ATMOSPHERE_PARAMS`), and
correctness depends on the two derivations agreeing — the coupling is enforced
only by prose ("MUST equal", `AtmosphereShellRenderer.d.ts`). The plan already
solved this shape one level down (`atmosphereShellDraw` is one derivation
feeding both `enabled` and `draw`); extend it: compute the atmosphere pose once
per frame off `ctx` and feed both the bake and the draw. Only the encode side's
camera source is currently test-guarded; the draw-site packing has no guard.

## 2. Equirect dir→uv convention has two homes (D9-l1, low)

`cubeSphereMesh.ts` (TS bake of vertex uvs) and `dirToEquirectUv` in
`earth/fragment.wesl` (the cloud-shadow crossing sample) co-encode the same
`u = atan2(y,x)/2π`, `v = asin(z)/π + 0.5` convention. Documented as a mirror
on both sides, no parity test (verified byte-identical in review). A mesh
longitude-basis change must touch both or ground shadows shift off the clouds
that cast them.

## 3. earthRenderer.setMap kind ladder → table dispatch (D9-l2, low)

`earthRenderer.setMap` grew one if-branch per plan (surface/material/night/
normal/clouds — five arms assigning five closure slots + a label ternary). The
build side got the equivalent consolidation (`KIND_WRITERS` table, plan C); the
renderer side didn't. A per-kind record table (`slot`, `format-axis`, `label`)
is the renderer twin of that fix. Trigger: the next kind, or the next time the
file is open for surgery.

## 4. Venus/Titan atmosphere = more than a params row (E7-E context)

`ATMOSPHERE_PARAMS` is data-not-code and `atmosphereShellRenderer` is genuinely
body-agnostic, but `initGpu` constructs one Earth-bound renderer instance and
the layer/encode are Earth-scoped. A second atmosphere body needs: per-params
renderer instances (LUT cache keyed by params), a layer that iterates
atmosphere-bearing bodies, and the encode gating per body. Same shape applies
to `cloudShellLayer` (Venus cloud deck). Recorded so the "just add a row"
docstring shortcut doesn't mislead a future implementer — the honest wording
fix landed in the plan-E close commit.

## 5. Three sphere-proxy meshes each hand-tuning their own margin (low-med)

Earth now draws three concentric sphere approximations, each carrying its own
tessellation constant and sag/margin bookkeeping: the cubesphere SURFACE
(`earthRenderer`, `CUBESPHERE_FACE_RESOLUTION`), the cloud shell
(`cloudShellRenderer`, 128×64 UV sphere at `radiusRatio` 1.002), and the
atmosphere-top shell (`atmosphereShellRenderer`, 128×64 UV sphere). The
tessellation-vs-radius-margin invariant (a facet's centre sag must stay under
the shell's clearance over the surface it hovers on) is stated separately in
each renderer's comment and would have to be re-derived by hand for a fourth
shell (Venus deck, a haze layer). A shared proxy-sphere idiom — one mesh
factory that takes the target radius margin and returns a tessellation that
guarantees the sag stays under it — would make the invariant one enforced
thing instead of three restated ones. NOT urgent: the three are correct today
and the surface's cubesphere has an independent reason to keep its own mesh
(the deferred terrain-displacement quadtree needs its vertices). Trigger: the
fourth sphere shell, or the next time two of these are open for surgery
together.

## 6. Cloud deck is Lambert-lit, not multiple-scattering (fidelity, med)

Promoted to its own item — see `2026-07-19-cloud-deck-pbr.md`. The deck is the
last ad-hoc layer in an otherwise PBR stack; the fuller analysis covers the
missing thickness channel, the cheap analytic phase term, and live-coverage vs
real-τ data sources.
