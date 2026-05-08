# 0009 — Sequence cosmic zoom AFTER engine restructure, MSDF labels, and asset loader; absorb the tour-animation brainstorm

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review by @rulkens

## Context

Skymap had a productive few weeks of planning before the cosmic zoom
landed. Several pending specs in `docs/superpowers/specs/` and several
plans in `docs/superpowers/plans/` are at varying degrees of readiness.
The cosmic zoom is not the only initiative in flight; deciding how it
relates to the others is itself a load-bearing choice. The full
relationship table appears in [`../README.md`](../README.md)
"Coordination with existing in-flight plans"; reproduced and elaborated
here:

| Existing work | Status as of 2026-05-08 | Relationship to cosmic zoom |
|---|---|---|
| Engine restructure (Spec B) | Plan written; phased PRs in progress (`chore/bootstrap-phases` is one of them) | **Hard dependency.** Shell controllers attach to the post-restructure engine. |
| MSDF labels | Spec written 2026-05-07; not yet implemented | **Hard dependency.** Every shell label and overlay text uses this. |
| Milky Way impostor | Spec written 2026-05-04; not yet implemented | **Hard dependency** for Shell 3. |
| CF-4 dark-matter volume render | Spec written 2026-05-07; not yet implemented | **Subsumed** as Shell 7's hero visual. |
| Asset loading infrastructure | Spec drafted; not yet implemented | **Hard dependency.** Per-shell datasets use the AssetSlot primitive. |
| Tour animation | Brainstorm from 2026-05-07; not converted to spec | **Subsumed.** The cosmic zoom IS the tour. |
| Services folder structure (Spec C) | Plan in early sketch | **Soft dependency.** Cosmic-zoom code lands in the new locations. |

Three patterns emerge:

- **Some plans are upstream of cosmic zoom and must land first.** Engine
  restructure, MSDF labels, Milky Way impostor, and the asset loader are
  primitives the cosmic zoom calls directly. Without them, every cosmic-
  zoom phase would either reinvent the primitive (wasteful) or paper over
  its absence (technical debt).
- **Some plans are absorbed by cosmic zoom.** The tour-animation
  brainstorm and the CF-4 dark-matter volume render are individually
  smaller than cosmic zoom and naturally subsume into it. The
  tour-animation brainstorm has no spec yet and was always going to need
  one; its open questions slot directly into cosmic-zoom decisions
  (camera choreography, shell pacing, narrative beats). The CF-4 spec is
  more mature and is treated as **consumed** rather than rewritten —
  Shell 7 imports its volume-render pipeline rather than re-specifying
  it.
- **Some plans run in parallel and rendezvous.** Spec C (services folder
  structure) is a code-organisation refactor that touches everywhere; it
  can land before, during, or after cosmic zoom. We pick one of two
  ergonomics (see Decision below) but do not block on it.

The risk if we get the sequencing wrong:

- **Build cosmic zoom on top of the current `engine.ts`.** The current
  engine is the very thing Spec B is restructuring; any cosmic-zoom
  shell-controller code attached to today's monolithic engine would have
  to be rewritten when Spec B lands. Worse, the cosmic zoom would
  re-bloat `engine.ts` with shell-management state, undoing Spec B's
  motivation before it has been merged.
- **Build cosmic zoom in parallel with engine work.** Both branches
  touch `engine.ts`, `cloudLoader.ts`, and the autoLod path. Nightly
  merge conflicts. Worse, the two branches would each grow up against
  yesterday's other branch, so neither could land cleanly.
- **Reinvent MSDF labels inside cosmic zoom.** Tempting because the
  cosmic zoom needs labels everywhere; but the MSDF spec is already
  designed by the user and a re-implementation would be a fork.

## Decision

**Cosmic zoom Phase 1 implementation begins only after the following
have landed on `main`:**

1. **Engine restructure (Spec B)** — all five phased PRs merged. `engine.ts`
   has its phases extracted (bootstrap, init, frame, input, slots, etc.,
   per the in-flight `src/services/engine/phases/` work).
2. **MSDF labels** — the label primitive exists and renders one Label
   per call.
3. **Asset loader** — the `AssetSlot` primitive exists. Cosmic zoom adds
   ~10 new slots; the loader must already handle slot lifecycle (request,
   in-flight, ready, evicted).
4. **Milky Way impostor** — required for Shell 3's hero visual. Can land
   in parallel with Phases 1–2 of the asset loader.

**Cosmic zoom subsumes** the following as it ships:

5. **Tour-animation brainstorm** is closed. Its open questions
   (camera-rotation policy, named-feature pauses, skip vs auto-advance)
   are answered inside cosmic-zoom's `decisions/0004-camera-rotation-during-tour.md`
   and [`../ux/00-interaction-model.md`](../ux/00-interaction-model.md).
   No separate tour-animation spec is written.
6. **CF-4 dark-matter volume render spec is consumed, not rewritten.**
   Shell 7 imports `src/data/cf4DensityFormat.ts` and the volume-render
   shader from the existing spec. Build-order dependency: the CF-4 spec
   ships first; cosmic zoom Phase 4 (Shell 7) does not start until it has.

**Soft dependency**, not blocking:

7. **Services folder structure (Spec C)** — cosmic-zoom code lands in
   the **new** locations from day one (e.g., `src/services/tour/` for
   shell controllers, not `src/engine/`). If Spec C is renamed before
   cosmic zoom merges, we follow the rename. If Spec C lands after, our
   new files are already in the right place.

## Alternatives considered

**(a) Ship cosmic zoom on top of the current `engine.ts` immediately.**
Pros: starts building user-visible value sooner; no waiting on upstream
plans. Cons: every shell controller gets rewritten when Spec B lands —
that is many files and many tests. Worse, the act of attaching shell
state to the current engine *re-bloats* `engine.ts` and undoes the
motivation for Spec B. Re-bloating something we have actively been
de-bloating is a strong negative signal. **Rejected.**

**(b) Ship cosmic zoom in parallel with engine and label work.** Pros:
calendar parallelism; cosmic zoom merges as soon as upstream is ready.
Cons: nightly merge conflicts on `engine.ts`, `cloudLoader.ts`, and the
autoLod path — each branch grows against the other branch's
yesterday-state. The plans most likely to conflict are Spec B (engine
restructure, by definition heavy on `engine.ts`) and the asset loader
(which the cloud loader will get rebased onto). The merge cost is
larger than the lead-time saved. **Rejected.**

**(c) Sequence cosmic zoom AFTER all four upstream plans land.** Chosen.
Calendar cost: ~3–6 weeks of lead time before cosmic-zoom Phase 1 can
start, depending on the cadence of the upstream PRs. Benefit: cosmic
zoom builds against stable, idiomatic primitives instead of
soon-to-be-rewritten ones, and contributes zero merge conflicts to the
upstream work it depends on.

**(d) Carve out the *parts* of cosmic zoom that don't depend on the
restructure and start those.** Tempting, but the natural starting
points (Phase 1 = solar system shell; Phase 2 = stellar neighborhood)
both go through the engine and the asset loader. There is no "isolated
sub-feature" that can ship without the upstream primitives. **Rejected
as a false economy.**

## Consequences

**Positive:**
- Cosmic zoom code is written against a clean, restructured `engine.ts`
  with phases extracted and per-shell controllers attaching cleanly.
- MSDF labels are used as the spec authors intended — many `Label`
  instances per shell, exactly the use case that justifies MSDF over
  raster fonts.
- The asset loader gets a substantial real-world test (~10 new slots
  with very different size and lifetime profiles) right after it ships.
- The tour-animation brainstorm is *closed*, not abandoned — its open
  questions get specific answers in cosmic-zoom decision documents.
  Future readers can grep for them.
- The CF-4 volume render spec gets exactly one consumer (Shell 7) which
  validates the design — no second client to negotiate API with.

**Negative:**
- **3–6 weeks of lead time before cosmic-zoom Phase 1 can start.** During
  this window the cosmic-zoom plan documents are visible but no code
  ships. Plan reviewers should not block on cosmic zoom for the duration
  — review of upstream plans (Spec B, MSDF, asset loader, Milky Way
  impostor) is the gating activity.
- **The cosmic zoom plan is exposed to upstream slippage.** If Spec B
  takes 8 weeks instead of 3, cosmic zoom Phase 1 slips proportionally.
  This is the cost of correct sequencing; we pay it knowingly.
- **Spec C (services folder) is a coordination risk.** If it lands after
  cosmic zoom and chooses different folder names than we anticipated, a
  rename-and-update PR is needed. We accept the cost; the alternative
  (block on Spec C) is worse.

**Operational:**
- A "cosmic zoom Phase 1 starts when" note lives in
  [`../implementation/00-phasing.md`](../implementation/00-phasing.md)
  with the four-item checklist from this ADR. The note is the gate.
- The tour-animation brainstorm document gets a banner pointing here:
  "This brainstorm is closed; questions are answered in
  `plans/2026-05-08-cosmic-zoom-powers-of-ten/`." Future readers
  arriving via that path are redirected.
- The CF-4 spec gets a similar back-reference:
  "Consumed by Shell 7 of the cosmic zoom; see
  `plans/2026-05-08-cosmic-zoom-powers-of-ten/shells/07-laniakea.md`."

## References

- [`../README.md`](../README.md) — coordination table this ADR
  formalizes.
- [`../implementation/00-phasing.md`](../implementation/00-phasing.md) —
  the start-gate checklist and Phase 1 entry conditions.
- [`0007-data-licensing.md`](0007-data-licensing.md) and
  [`0008-build-pipeline.md`](0008-build-pipeline.md) — sibling ADRs in
  this round; together with this one they cover the three big
  cross-cutting decisions for the plan.
- [`../shells/07-laniakea.md`](../shells/07-laniakea.md) — the consumer
  of the existing CF-4 dark-matter volume render spec.
- `docs/superpowers/specs/2026-05-07-msdf-labels-design.md` — upstream
  label primitive.
- `docs/superpowers/specs/2026-05-07-tour-animation-design.md` — the
  brainstorm this ADR closes.
- `docs/superpowers/specs/2026-05-04-milky-way-impostor.md` — Shell 3's
  hero visual.
- `docs/superpowers/specs/2026-05-07-cf4-dark-matter-volume-render-design.md`
  — Shell 7's hero visual; consumed, not rewritten.
- `src/services/engine/phases/` — the in-flight engine restructure
  whose completion gates cosmic-zoom Phase 1.
