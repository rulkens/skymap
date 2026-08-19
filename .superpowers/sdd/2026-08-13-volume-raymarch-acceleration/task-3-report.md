# Task 3 report — per-field max-value pyramid (deviation space) + binding 5

## What shipped

- `src/@types/rendering/FieldEntry.d.ts` — `maxPyramidTexture: GPUTexture`.
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`:
  - `group0Bgl` gains binding 5, `textureLoad`-only 3D texture
    (`sampleType: 'unfilterable-float'`, `viewDimension: '3d'`, no sampler).
  - New `maxPyramidMb` — a `createMipBlit3dPipeline(device, 'max', 'r16float')`
    hoisted to factory scope (format is always `r16float` regardless of
    field, so one pipeline serves every `upload()` call, mirroring the
    raymarch `pipeline`'s own hoist).
  - New `buildMaxPyramid(volumeTexture, dims, contrastCenter)`: three chained
    2x max-reductions (`downsampleLevel3d`, Task 2's exported primitive)
    through two upload-time-only scratch textures (`r16float`,
    `TEXTURE_BINDING | RENDER_ATTACHMENT`, destroyed right after the submit
    that consumes them) — volume level 0 → scratch A (`ceil(dims/2)`) →
    scratch B (`ceil(dims/4)`) → `maxPyramidTexture` level 0
    (`ceil(dims/8)`). Only the first reduction passes the field's real
    `contrastCenter`/`halfRange = max(contrastCenter, 1-contrastCenter)`
    (`applyContrastWindow`'s own formula); the other two use identity
    (`0, 1`) since deviation is already non-negative and composes correctly
    under `max()`. `generateMipChain3d(device, maxPyramidTexture, 'max')`
    then fills the pyramid's own chain above that base (its internal loop
    already hard-codes identity center/halfRange — verified, no change
    needed there).
  - `upload()` calls `buildMaxPyramid` right after `uploadCube`, adds the
    binding-5 bind-group entry, and stores `maxPyramidTexture` on the
    `FieldEntry`. `unload()`/`destroy()`/the existing-field-replace branch
    in `upload()` all destroy it alongside the other per-field textures.
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` —
  one assertion updated: constructing the renderer now creates two render
  pipelines (raymarch + the hoisted max mip-blit pipeline), not one; the
  test locates the raymarch pipeline by its colour-target format
  (`'rgba16float'`) instead of assuming index 0. No other test needed
  changes — the mock device's existing `createTexture`/`createBindGroup`/
  `createCommandEncoder` stubs already generalise over the extra calls.

## Cross-file contract note (as flagged in the brief)

No shader declares binding 5 yet — `fragment.wesl` is untouched, that's
Task 5's job. This is safe: `group0Bgl` is the pipeline's **explicit**
layout (`device.createPipelineLayout({ bindGroupLayouts: [group0Bgl,
fadeBgl] })`), not `'auto'`, and WebGPU permits a bind group to carry BGL
entries the current shader doesn't read. Confirmed empirically too — the
visual-gate run below created the binding-5 bind group entry every
`upload()` call with zero WebGPU validation errors in the console.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npx tsc --noEmit -p tsconfig.tools.json` → clean.
- `npx vitest run tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`
  → 8/8 pass.
- `npx vitest run` (full suite) → 1023 files / 6901 tests pass.
- `npx prettier --write` on all three touched files → unchanged (already
  formatted).

## Visual gate

Playwright headless against the running dev server (`http://localhost:5173`),
`?perf` mode, `volume-inside` scenario pose from `tools/perf/perfScenarios.ts`.
Corrected the leftover scratch screenshot script found in this session's
scratchpad (it skipped the splash-dismiss step, so its captures were of the
splash overlay, not the live scene) to match Task 2's documented procedure:
click "Explore", wait 4s for the boot fly-to-Earth to settle before
`setPose` (same landmine Task 2 hit), wait 1.5s more, screenshot.

"Before" captured by diffing + `git checkout --` on the two tracked source
files (`git stash` is banned), then re-applying via `git apply` after the
screenshot — matching Task 2's technique exactly.

Result:
- `before.png` / `after.png`: visually identical (general starfield/point-
  cloud view with the nav+settings panel open — the `setPose` target didn't
  visibly change the dominant on-screen content between runs, but that's
  irrelevant to what this gate is checking: whether adding an unconsumed
  bind-group binding regresses anything).
- `diff.png`: `meanAbsDiff = 0.268` (/255), `maxAbsDiff = 221` (a single
  hot pixel — the UTC clock digit ticking between captures, same class of
  false-positive Task 2 noted). Well under the brief's `< 2/255` gate.
- Zero WebGPU/console errors in either capture (only benign SDSS-footprint
  404s, present in both) — this is the load-bearing check for this task:
  proof the new binding-5 bind-group entry validates fine against the
  explicit pipeline layout even though no shader stage declares it.

## Commit

`6e93d14af` — `feat(volumes): build the per-field max-value pyramid in
deviation space`. Files: `src/@types/rendering/FieldEntry.d.ts`,
`src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`,
`tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`.
