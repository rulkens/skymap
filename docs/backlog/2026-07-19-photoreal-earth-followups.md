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

`cloudShell/fragment.wesl` shades the deck with a single Lambert term scaled by
`sunIrradiance` (plus the ambient floor). Real cloud brightness is dominated by
MULTIPLE scattering: it is why decks stay bright at high sun angles, why thick
clouds self-shadow, and why their edges glow (forward-scatter silver lining).
The current model gives none of that — a flat textured shell that dims by
`N·L` alone. A physically-fuller cloud deck would want at least a cheap
multiple-scattering approximation (a Hillaire-style powder/HG term, or a
2-parameter analytic phase) driven by the cloud map's optical thickness. This
is the biggest remaining PBR gap in the Earth stack (the surface is
Cook-Torrance + Oren-Nayar, the atmosphere is Bruneton/Hillaire; only the
clouds are ad-hoc). Deferred as its own effort — it needs a cloud optical model
and probably a thickness channel, not just a shader tweak.
