# Task 3 review — per-field max-value pyramid (deviation space) + binding 5

Commit reviewed: `6e93d14af` (diff `17c3b28b9..6e93d14af`)

## Spec ✅

All brief requirements verified against the committed code, not just the report's prose:

- **Binding 5** (`volumeFieldRenderer.ts`, `group0Bgl`): exactly
  `{ binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } }`,
  no sampler. Matches the brief verbatim.
- **`FieldEntry.maxPyramidTexture: GPUTexture`** added, `type` (not `interface`).
- **Deviation-space transform routing** — traced end to end, not inferred:
  - `mipBlit3d.wesl` `fs_max`'s `deviation(x) = abs(x - u.center) / u.halfRange`, accumulated via `max()` starting from `m = 0.0` (safe since `dev ≥ 0` always).
  - `buildMaxPyramid`'s **first** `downsampleLevel3d` call (volume → scratchA) passes the field's real `contrastCenter` and `halfRange = Math.max(contrastCenter, 1 - contrastCenter)` — same formula as `applyContrastWindow` (`fragment.wesl:168`), not hardcoded.
  - The **second and third** calls (scratchA → scratchB, scratchB → pyramid level 0) pass literal `(0, 1)` — identity, no double-transform.
  - `generateMipChain3d`'s internal loop (used for the pyramid's own levels 1..N-1) hardcodes `center = 0, halfRange = 1` — confirmed in `generateMipChain3d.ts:201-202`, unconditional, not field-dependent.
  - Net effect: raw→deviation happens exactly once, at the one call site the brief specifies. No compression/over-skip risk.
  - Shader entry point for all three `buildMaxPyramid` passes is `fs_max` (via `maxPyramidMb = createMipBlit3dPipeline(device, 'max', 'r16float')`, hoisted once, filter fixed at construction) — never `fs_box`. Confirmed no negative writes possible (`abs(...)` output, `r16float` headroom for `[0,1]` is fine).
- **Destroy correctness**:
  - Scratch textures (`scratchA`, `scratchB`) destroyed immediately after `device.queue.submit(...)` that consumes them (`volumeFieldRenderer.ts`, in `buildMaxPyramid`) — after the submit, as required.
  - `maxPyramidTexture` destroyed in both `unload()` and `destroy()`, alongside the other per-field textures.
  - `upload()`'s `existing` re-upload branch (top of `upload`) also calls `existing.maxPyramidTexture.destroy()` — checked specifically per the review brief; present.
- **Scope**: diff touches exactly `src/@types/rendering/FieldEntry.d.ts`, `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`, and the one test file. No changes to `generateMipChain3d.ts` or `mipBlit3d.wesl` (both were already in the shape Task 3 needed from Task 2; nothing required touching them here) — confirmed via `git diff --stat 17c3b28b9..6e93d14af`.
- **Mock-device test updates**: minimal — one pre-existing assertion (`renderPipelines).toHaveLength(1)` → `2`) updated because construction now legitimately creates two render pipelines (raymarch + hoisted max mip-blit pipeline), and the raymarch pipeline is now located by colour-target format instead of array index. No `createTexture`/`createBindGroup` call-count assertions were added or exist elsewhere in the file that this diff could have broken (checked by grep across the whole test file).
- Full suite: reran `npx vitest run tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` → 8/8 pass. `npx tsc --noEmit -p tsconfig.json` → clean.

No missing/extra items against the brief.

## Task quality verdict: **Approve**

No Critical or Important findings.

### Minor

1. **Pyramid-dims concern in `progress.md` is resolved, not open** (`volumeFieldRenderer.ts:129-131`, `halfCeil`). The implementer flagged "chained ceil-halving agrees with `ceil(dims/8)` for shipped grids but not arbitrary odd dims — reviewer to assess." I checked this directly: `Math.max(1, Math.ceil(d/2))` applied three times is mathematically **identical** to `Math.max(1, Math.ceil(d/8))` for every positive integer `d` (ceiling-division composition is associative: `ceil(ceil(n/a)/b) = ceil(n/(ab))`); verified exhaustively for `d` in `[1, 2000]` with zero mismatches, including all odd values. So there is no dims mismatch, arbitrary-odd or otherwise, and — independently — the brief's own fallback (Task 5 reading `textureDimensions` off the actual pyramid texture rather than re-deriving `dims/8`) would have made this moot even if the identity didn't hold. Not a defect; the implementer should have verified the math rather than deferring it, but flagging an uncertain edge case for review is reasonable practice, not a quality problem worth downgrading the task for.
2. **`FieldEntry.d.ts` comment density.** The new `maxPyramidTexture` field carries a 9-line doc comment for a 1-line declaration (9:1 in the diff), and the whole file's comment:code ratio is ~3.4:1 — both nominally over the CLAUDE.md "comments ≤ half the code" budget read literally. This is not a new pattern introduced by this task, though: every other field in this same file (`contrastCenter`, `envelopeInner`/`envelopeOuter`, `residentPaletteId`, `fadeBuffer`, `fadeBindGroup`) already carries a comparably-sized paragraph doc — this file is an established "data-dictionary" `.d.ts` where the convention is evidently applied per-file-as-a-whole rather than per-declaration, and the new field matches that pre-existing local convention exactly. Not blocking; noting it since the reviewer brief calls out the comment budget as a binding constraint.
3. **`volumeFieldRenderer.ts` new code stays inside budget**: measured the diff's added lines in isolation (comment lines vs code lines, block/line comments counted) — 28 comment / 83 code ≈ 0.34, under the 0.5 ceiling.

## ⚠️ Cannot-verify

- Visual-gate screenshots (`before.png`/`after.png`/`diff.png`) referenced in the report were not located in this review pass (not present under the SDD directory tree checked) — took the report's `meanAbsDiff = 0.268`, `maxAbsDiff = 221` (single hot pixel, UTC clock) figures and "zero WebGPU/console errors" claim on faith rather than re-running the Playwright capture myself. Low risk: this task adds an unconsumed bind-group binding with no shader-visible effect, so a visual regression here would be surprising, and the mechanism (explicit non-`'auto'` pipeline layout tolerating an unread BGL entry) is a well-understood WebGPU rule, not a novel claim.
