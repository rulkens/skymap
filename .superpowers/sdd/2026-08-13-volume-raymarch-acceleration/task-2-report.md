# Task 2 report — `mipLevelCount3d` + `generateMipChain3d`

## What shipped

- `src/services/gpu/lib/generateMipChain3d.ts` — `mipLevelCount3d` (3-arg
  generalisation of `mipLevelCount`), `createMipBlit3dPipeline` (builds the
  box/max render pipeline once), `downsampleLevel3d` (exported single-
  level-pair primitive, per-z-slice render passes), `generateMipChain3d`
  (the caller-facing loop, wired for `uploadCube`'s box-filter display chain
  today; Task 3 will call `downsampleLevel3d` directly for its cross-texture
  max pyramid).
- `src/services/gpu/shaders/lib/mipBlit3d.wesl` — `vs` (shared big-triangle,
  mirrors `mipBlit.wesl`), `fs_box` (one `textureSampleLevel` trilinear tap at
  `u.boxZ`), `fs_max` (eight `textureLoad` taps over the 2×2×2 parent
  footprint, deviation-space normalised, max-reduced), `MipBlit3dUniforms`
  (20-byte all-scalar struct per the plan amendment: `boxZ: f32, srcZLow: u32,
  srcZHigh: u32, center: f32, halfRange: f32`).
- `volumeFieldRenderer.ts`'s `uploadCube` — texture now created with
  `mipLevelCount: mipLevelCount3d(...)` and `RENDER_ATTACHMENT` in `usage`;
  `generateMipChain3d(device, tex, 'box')` runs after `writeTexture`. The
  raymarch shader is untouched and still samples level 0 only, so this task
  is visually inert (confirmed below).

## Design decisions

- **x/y for `fs_max` come from `@builtin(position)`, not a uniform.** The
  uniform only carries z (boxZ/srcZLow/srcZHigh) because z is the one axis a
  fullscreen triangle's rasterised position can't supply — x/y fall out of
  the fragment's own framebuffer position (`in.clip.xy`), exactly mirroring
  how `fs_box` gets x/y for free from the interpolated UV.
- **`boxZ` formula**: `(dz + 0.5) * (srcDepth/dstDepth) - 0.5`, the exact 3D
  generalisation of the *implicit* mapping the rasteriser already gives
  `fs_box`'s x/y (continuous dst-texel-centre → parent-space position).
  Derived and verified against the existing 2D behaviour algebraically before
  implementing — see the reasoning trail in this task's tool-call transcript
  if it needs re-deriving.
- **`srcZLow`/`srcZHigh` clamp**: `min(2*dz, srcDepth-1)` /
  `min(2*dz+1, srcDepth-1)`. Under `generateMipChain3d`'s own floor-based mip
  dims (`levelDim = max(1, floor(dim0/2^level))`, the standard WebGPU mip
  sizing rule — not something a caller can override) this clamp never
  triggers; it exists for Task 3's scratch-texture chain, where `dst.depth`
  may be `ceil(src.depth/2)` for full coverage, and the last slice can
  legitimately have only one parent tap (`srcZLow === srcZHigh`, the "odd-
  depth edge" the plan amendment calls out). Verified both cases by hand
  before writing the code.
- **One uniform buffer per (level, z-slice) pass.** `device.queue.writeBuffer`
  calls made before a shared `submit()` are ordered by JS call order, not by
  which pass reads them — reusing one buffer across passes in the same
  encoder would leave every pass reading the LAST write. Each per-slice
  buffer is written exactly once, so batching every pass into one encoder +
  one `submit()` (mirroring 2D `generateMipChain`'s "one encoder, one submit
  for the whole chain" invariant) stays correct.
- **`downsampleLevel3d` is exported, filter-agnostic in its own body** — it
  always computes both `boxZ` and `srcZLow`/`srcZHigh` and writes all 5
  uniform fields regardless of which pipeline (`box` or `max`) it's called
  with; the unused half is harmless. This means Task 3 can call it directly
  against its own scratch-texture pairs without re-deriving the per-slice
  math, per the plan's explicit ask.
- **Struct is exactly 20 bytes, no padding** — confirmed the WGSL uniform-
  address-space rule: an all-scalar struct's alignment is its largest
  member's own alignment (4 bytes for f32/u32), not 16, so 5×4=20 needs no
  padding. GPUBuffer created at exactly 20 bytes (not rounded to 32) since
  `writeBuffer`'s only real constraint is a multiple of 4.

## Mock changes (`volumeFieldRenderer.test.ts`)

`mockDevice`'s `createTexture` now threads the descriptor through into the
returned stub (`format`, `mipLevelCount`, `width`/`height`/
`depthOrArrayLayers` read off `desc.size`) so `generateMipChain3d`'s internal
per-level dims math has something real to read. Added `createCommandEncoder`
(returns a stub `beginRenderPass`/`finish`) and `queue.submit` so the box-
filter chain `uploadCube` now triggers can run to completion without
throwing. All 8 existing tests pass unmodified in behaviour — only the mock
shape grew.

## Visual sanity gate

Ran the dev server (already running in this worktree, port 5173) through
Playwright headless, at the `volume-inside` perf scenario pose
(`tools/perf/perfScenarios.ts`). `git stash` is banned, so captured "before"
by diffing+reverting only the one tracked file that changes behaviour
(`volumeFieldRenderer.ts`) via `git diff > patch` + `git checkout --`, then
re-applying via `git apply` after the screenshot — new files
(`generateMipChain3d.ts`, `mipBlit3d.wesl`) stayed on disk throughout since
nothing imported them in the reverted state.

Gotcha found along the way: dismissing the splash ("Explore") starts a boot
fly-to-Earth sequence driven by a follow driver that keeps re-centering the
camera every frame; a `setPose` call issued too soon after dismissal loses
the race even with `clearFocus: true`. Fix: wait ~4s after the Explore click
for the boot flight to fully settle before calling `setPose`.

Result — `.superpowers/sdd/2026-08-13-volume-raymarch-acceleration/task-2-visual/`:
- `before.png` / `after.png`: visually indistinguishable star/cosmic-web field
- `diff.png` + numbers: `meanAbsDiff = 0.601` (/255), `maxAbsDiff = 212`
  (single hot pixel — the UTC clock readout ticking one minute between
  captures, not a rendering difference). Well under the brief's `< 2/255`
  mean-abs-diff gate; no structural difference visible in the diff image
  (just sparse temporal-dither noise across the star field, same texture as
  the clock-digit edge).

## Verification

- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npx vitest run tests/services/gpu/lib/mipLevelCount3d.test.ts` → 3/3 pass.
- `npx vitest run tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` → 8/8 pass.
- `npx vitest run` (full suite) → 1023 files / 6901 tests pass.
- `npx prettier --write` on all touched files.

## Commit

One commit, explicit paths staged (not `git add -A`):
- `src/services/gpu/lib/generateMipChain3d.ts` (new)
- `src/services/gpu/shaders/lib/mipBlit3d.wesl` (new)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modified)
- `tests/services/gpu/lib/mipLevelCount3d.test.ts` (new)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modified)

`.superpowers/` is gitignored — the visual-gate PNGs stay local artifacts,
consistent with Task 1's workspace files.

## Fix round 1 — Critical: fs_max drops the trailing slice/row/column on an odd parent dimension

**Finding (verified numerically by the reviewer):** `fs_max`'s footprint was
fixed 2-wide per axis — `srcZLow`/`srcZHigh` from a TS-computed uniform pair
for z, and the X/Y mirror of the same `min(2*d, dim-1)`/`min(2*d+1, dim-1)`
clamp inline in the shader. Floor-sizing (`dstDim = floor(parentDim/2)`)
means that clamp is unreachable at the true edge: for a parent depth of 91,
the last destination slice (`dz=44`) taps parents 88 and 89 only — parent 90
is never read. On the real MCPM dims (178×300×182) this dropped z=90
(91→45) and x=88 (89→44) on the level1→level2 max reduction. `fs_box` was
unaffected (continuous-ratio trilinear blend already covers the trailing
slice) and was left untouched. Because Task 3's empty-space-skip pyramid is
built on `fs_max`'s output, an under-reported max there causes unsafe
over-skip (visible holes) downstream — this was gated Critical.

**Fix — shader-side, no TS tap-range logic added:** replaced the fixed
2×2×2 footprint with a `tapRange(d, parentDim) -> vec2<i32>` helper in
`mipBlit3d.wesl` that returns an inclusive `[low, high]` per axis: normally
2-wide (`2d, 2d+1`), but 3-wide (`2d, 2d+1, parentDim-1`) at the last
destination index on an odd-sized axis, so the trailing parent index is
always covered (worst case, a corner cell, taps 3×3×3=27 parent texels).
`fs_max` now calls `tapRange` once per axis — x/y from the fragment's own
`@builtin(position)` (unchanged), z from a new `u.dstZ` field — and reduces
over three nested dynamic `for` loops instead of eight hardcoded taps.
Parent dims for all three axes now come from `textureDimensions(srcTex)`
(already used by `fs_box` for z) rather than being threaded through the
uniform — `fs_max` was already relying on this for x/y, so extending it to
z removed the need for `srcZLow`/`srcZHigh` entirely.

`MipBlit3dUniforms` shrank from 20 to 16 bytes: `boxZ: f32, dstZ: u32,
center: f32, halfRange: f32` (dstZ replaces srcZLow+srcZHigh — the shader
derives the range itself). Still all-scalar, still no padding (4×4=16,
every field 4-byte aligned at its own offset). `downsampleLevel3d` in
`generateMipChain3d.ts` writes `dz` (the loop's own destination-slice index)
into that field instead of precomputing a clamped low/high pair; the
uniform buffer size dropped from 20 to 16 bytes to match.

No TS helper was extracted — the tap-range computation lives entirely in
`tapRange` inside the shader (x/y ranges are computed from the fragment's
own framebuffer position, which has no TS-side equivalent to unit-test
against; z uses the identical function). Per the fix brief's own rule, a
shader-restating TS test would not test anything a real bug could break
independently, so none was added.

**Manual verification of the fixed formula** (by hand, matching the
reviewer's numbers): parent depth 91 → dstDim 45, last index d=44 →
`low=88`, `dstDim-1==44` and `91%2==1` → `high=90`. Taps 88, 89, 90 — parent
90 now covered. Parent width 89 → dstDim 44, last index d=43 → `low=86`,
`dstDim-1==43` and `89%2==1` → `high=88`. Taps 86, 87, 88 — parent 88 now
covered. Even-axis and interior-cell cases (`d != dstDim-1`, or `parentDim`
even) reduce to the original 2-wide range unchanged, so `fs_max`'s output on
even dimensions and non-edge cells is bit-for-bit identical to before the
fix.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npx tsc --noEmit -p tsconfig.tools.json` → clean.
- `npx vitest run tests/services/gpu/lib/mipLevelCount3d.test.ts
  tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` →
  11/11 pass (unchanged from before the fix — neither test exercises
  `fs_max`'s pixel output, only the TS-side pipeline plumbing).
- `npx vitest run` (full suite) → 1023 files / 6901 tests pass.
- `wesl-shaders` skill invoked before editing `mipBlit3d.wesl`, per the
  fix brief's mandatory rule.

**Commit:** `17c3b28b9` — `src/services/gpu/shaders/lib/mipBlit3d.wesl`,
`src/services/gpu/lib/generateMipChain3d.ts` (`.superpowers/` is gitignored,
so this report stays a local artifact, same as Task 2's original report).
