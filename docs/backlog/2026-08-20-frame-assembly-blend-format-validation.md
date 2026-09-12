# Frame-assembly walker needs target-format-parity validation

Surfaced by `docs/research/engine/current-contracts-map.md`'s loose-spots
table (§2, `:92-93`) and §8 "Gaps the spec does not cover" item 3 (`:270`),
restated in §6's assessment table as row #7 ("Unvalidated cross-file
contracts"). Blend half resolved 2026-09-12 by the field's deletion in PR
#690. Only the target-format-parity half remains open.

## What it is

**Render-target formats are hand-matched at construction, unenforced**
(`gpuHandleRegistry.ts:317-321`, moved from `initGpu.ts` since this was
filed) — a renderer's expected target format and the `RenderTargetSpec`
it's wired to are both authored by hand, with nothing checking they agree.
Renderers now share `HDR_TARGET_FORMAT`/`FOREGROUND_DEPTH_FORMAT` constants
(`data/renderTargetFormats.ts`) rather than repeating literals, which
narrows but doesn't close the gap this item is about.

The adjacent half of this same loose-spot row — `layer.target ∈ specs` and
the unique-`ContentPass.name` check — **is already closed**: covered by
`tests/services/engine/frame/targetParity.test.ts`, shipped in rung 2.

## Why it matters

Bug-risk, not cleanup: a mismatched target format either fails silently
(wrong-looking output with no error) or surfaces as an opaque GPU
validation error far from the authoring site that caused it. The frame
assembly walker envisioned in `current-contracts-map.md` §7 already lists a
`W5` "frame-assembly validation (layers ↔ program steps coverage)" walker
as part of the settled target shape — this item is the check that walker
was always meant to carry but doesn't yet.

## Approach

No design done. A walker over `FRAME_ORDER`'s expanded steps (`FRAME_ORDER`
replaced `frameProgram`) that, for each step, resolves the renderer(s) its
`draw()` touches and asserts the step's target format matches the
renderers' expected format. Given format is a static per-layer fact (not
per-frame), this plausibly runs once at `initGpu` construction time rather
than every frame — closer to a boot-time assertion than a hot-path check.
