# Unify `ReadyFrameContext`'s camera-derived fields into one view record

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging) — its per-eye override is exactly a hand-rolled version
of the seam this item proposes.

## What it is

`ReadyFrameContext` (`src/@types/engine/frame/ReadyFrameContext.d.ts`) carries
the frozen `OrbitCamera` (`cam`) plus a set of separately-derived per-frame
quantities: `vp`, `slabs`, `drawCamPos`, `drawPxPerRad`, `fovYRad`. Each of
these is "the camera" restated a different way, computed independently
rather than as one struct swapped together. Per-frame memos throughout the
renderer (`prepareStarCut`'s `preparedByCtx`, and others — see the sibling
item [`renderer-landmine-docs`](2026-08-23-renderer-landmine-docs.md)) key on
`ctx` identity, which silently assumes exactly one camera is live per frame.
Billboard bases (camera-facing right/up vectors used by sprite/point
renderers) are a further derivation from the same camera, computed again at
whichever draw site needs them.

Nothing on `main` is broken by this today — mono has exactly one camera per
frame, so "keyed on ctx" and "keyed on camera" coincide. The spike needed a
second camera per frame (one per eye) and had to invent
`vrSpikeState.ts`'s `applyVrEyeToCtx` to swap the per-eye pieces of `ctx` by
hand, one field at a time, because there was no single seam to swap instead.

## Why it matters

Every camera-dependent memo on `main` is implicitly a "one camera per ctx"
assumption, undocumented at each call site and enforced nowhere. The
assumption is currently true, so nothing fails — but the failure mode when a
second per-frame camera view _does_ show up (stereo, cube-map capture, a
shadow pass) is silent staleness (see
[`renderer-landmine-docs`](2026-08-23-renderer-landmine-docs.md) item 1), not
a compile error. A structural fix removes the assumption instead of asking
every future memo author to remember it.

## Proposed design direction

Replace the scattered camera-derived fields on `ReadyFrameContext` with one
`view` record — camera + vp + slabs + rebase origin + billboard basis — built
once per camera and swapped wholesale when the camera changes. Every
camera-dependent memo keys on that record's identity instead of `ctx`'s,
so staleness across a second camera becomes structurally impossible rather
than a discipline every new memo has to remember.

This needs a real design pass before a plan — the split isn't obvious from
this write-up alone. Open questions to weigh:

- Whether `slabs` (plural, per-frame) and a single `view` (one camera) are
  actually the same cardinality, or whether the multi-slab table needs to
  stay ctx-level while only the single-camera pieces (`vp`, `drawCamPos`,
  billboard basis) move onto `view`.
- Whether `view` should be a new type alongside `ReadyFrameContext` (ctx
  holds one `view` today, N in a stereo/multi-view future) or whether
  multi-view is out of scope and this is purely a same-cardinality
  refactor for clarity.
- Migration shape: every current `ctx.vp`/`ctx.drawCamPos`/`ctx.slabs` read
  site would move to `ctx.view.vp` etc. — a mechanical but wide-reaching
  rename, candidate for `npm run move-files`/`npm run refactor` tooling
  rather than hand-editing.

## Purity note

This is not a call to cache more. Frame-coherence snapshotting (the reason
`ReadyFrameContext` exists at all) stays — it is correct by design, not
accidental complexity. Expensive derived structures that already deserve
their own memo (`prepareStarCut`'s octree cut, the solar-system planner, label
layout) stay cached, but keyed on their actual inputs (camera position,
catalog generation) rather than on `ctx` identity as a proxy for "camera
hasn't changed." Cheap derivations (`vp`, `drawCamPos`, billboard basis) need
no caching at all — recomputing them from `view.cam` costs nothing near what
a stale-cache bug costs to find.

## Related

This is also the ground-preparation seed if the VR spike (branch
`worktree-quest-vr-spike`, PR #625) ever graduates: its per-eye override
(`vrSpikeState.ts`'s `applyVrEyeToCtx`) would become a direct consumer of
this seam — swap `view` per eye — instead of reimplementing the swap. The
spike itself does not merge; this item stands on its own as a `main`-side
architecture cleanup regardless of whether VR ever returns.
