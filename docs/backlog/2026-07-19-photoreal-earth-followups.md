# Photoreal-Earth follow-ups (post plans A–E)

Drift-trap knots surfaced by the entanglement-radar passes over the
photoreal-Earth feature branch (plans A–E, PR #453) and triaged by the final
whole-plan reviews as **backlog, not blockers**. Everything here is
agree-by-construction or dead-code-safe today; each item removes a
hand-synchronized mirror before it can drift.

## 2. Equirect dir→uv convention has three homes (D9-l1, low)

`cubeSphereMesh.ts` (TS bake of vertex uvs), `dirToEquirectUv` in
`earth/fragment.wesl:159-163` (the cloud-shadow crossing sample) and
`equirectUvFromDir` in `lib/analyticSphere.wesl:169-173` co-encode the same
`u = atan2(y,x)/2π + 0.5`, `v = asin(z)/π + 0.5` convention. The third is the
canonical WESL home and did not exist when this was filed — the analytic-sphere
primitive added it — so the fix now has an obvious destination:
`earth/fragment.wesl` imports it instead of re-deriving. `dirToEquirectUv` is
`equirectUvFromDir` plus a `fract` on u, and that wrap is what the sampler's
`repeat` addressing does anyway.

The `0.5` map-centre offset rides along as a third copy of
`TEXTURE_PRIME_MERIDIAN_U` (`src/data/bodies/texturePrimeMeridianU.ts`, whose
"three sites" docblock predates the fourth). `analyticSphere.wesl:93-97` at
least names that source of truth; `earth/fragment.wesl` writes a bare literal.
No parity test on any copy: the two TS meshes are each pinned separately (lon 0
→ u 0.5), nothing covers either WESL copy and nothing ties the copies together.
A mesh longitude-basis change must touch every copy or Earth's ground shadows
shift off the clouds that cast them.

## 3. earthRenderer.setMap kind ladder → table dispatch (D9-l2, low)

`earthRenderer.setMap` grew one if-branch per plan (surface/material/night/
normal/clouds — five arms assigning five closure slots + a label ternary). The
build side got the equivalent consolidation (`KIND_WRITERS` table, plan C); the
renderer side didn't. A per-kind record table (`slot`, `format-axis`, `label`)
is the renderer twin of that fix. Trigger: the next kind, or the next time the
file is open for surgery.

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
