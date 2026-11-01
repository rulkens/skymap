# Photoreal-Earth follow-ups (post plans A–E)

Drift-trap knots surfaced by the entanglement-radar passes over the
photoreal-Earth feature branch (plans A–E, PR #453) and triaged by the final
whole-plan reviews as **backlog, not blockers**. Everything here is
agree-by-construction or dead-code-safe today; each item removes a
hand-synchronized mirror before it can drift.

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
