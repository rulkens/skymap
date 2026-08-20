# Frame-assembly walker needs blend-legality + target-format-parity validation

Surfaced by `docs/research/engine/current-contracts-map.md`'s loose-spots
table (§2, `:92-93`) and §8 "Gaps the spec does not cover" item 3 (`:270`),
restated in §6's assessment table as row #7 ("Unvalidated cross-file
contracts"). `ORPHAN` in the 2026-08-20 carry-forward audit: not in any
ladder rung's scope, not in `decisions.md`'s carried-forward list (#17), not
in `BACKLOG.md`.

## What it is

Two frame-assembly facts are asserted but never checked:

- **`ContentLayer.blend` is advisory.** The field exists
  (`ContentLayer.d.ts:52`) and its own docblock calls itself "the intended
  guardrail, not yet built" — nothing verifies a layer's declared `blend`
  value actually matches the `GPUBlendState` baked into the pipeline its
  `draw()` calls.
- **Render-target formats are hand-matched at construction, unenforced**
  (`initGpu.ts:426-428`) — a renderer's expected target format and the
  `RenderTargetSpec` it's wired to are both authored by hand, with nothing
  checking they agree.

The adjacent half of this same loose-spot row — `layer.target ∈ specs` and
the unique-`ContentLayer.name` check — **is already closed**: covered by
`tests/services/engine/frame/targetParity.test.ts`, shipped in rung 2. Only
the blend-legality and format-parity halves remain open.

## Why it matters

Bug-risk, not cleanup: a mismatched blend mode or target format either fails
silently (wrong-looking output with no error) or surfaces as an opaque GPU
validation error far from the authoring site that caused it. The frame
assembly walker envisioned in `current-contracts-map.md` §7 ("What the
subsystem-bundle spec changes") already lists a `W5` "frame-assembly
validation (layers ↔ program steps coverage)" walker as part of the settled
target shape — this item is the two checks that walker was always meant to
carry but doesn't yet.

## Related, but distinct

[`docs/backlog/2026-07-31-layer-blend-declared-twice.md`](2026-07-31-layer-blend-declared-twice.md)
is about the _authoring_ side of blend: `ContentLayer.blend` and the
pipeline's `GPUBlendState` are declared twice with no single source
(`blendStateOf(blend): GPUBlendState` is the proposed seam). This item is
about the _validation_ side: even with a `blendStateOf` seam in place, or
without one, nothing currently checks that a layer's declaration and its
pipeline's actual blend state agree, nor that a layer's target format and its
renderer's expected format agree. If `blendStateOf` ships first, this item
narrows to "target-format parity only" — worth re-checking at pickup time.

## Approach

No design done. Starting points:

- A `frameProgram`-adjacent walker (parallel to the already-shipped
  `targetParity.test.ts` coverage check) that, for every `ContentLayer`,
  resolves the renderer(s) its `draw()` touches and asserts declared `blend`
  matches the pipeline's `GPUBlendState`, and declared target format matches
  `RenderTargetSpec.format`.
- Given `blend` and target format are both static per-layer facts (not
  per-frame), this plausibly runs once at `initGpu` construction time rather
  than every frame — closer to a boot-time assertion than a hot-path check.
- Decide whether this rides an eventual `SubsystemBundle` walker (deferred
  per decisions.md #9/#17 until rungs 7 and 8 land) or ships standalone
  against today's flat `CONTENT_LAYERS` registry — the check doesn't
  obviously need the bundle contract to exist first.
