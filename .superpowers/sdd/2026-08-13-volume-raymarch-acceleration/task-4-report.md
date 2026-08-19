# Task 4 report — per-field uniform bump 256 → 272

**Status:** DONE

**Commit:** `7ecdd69058ecd136ef9c6d8db736906c82270a2d`

**Tests:** full suite green — 1023 test files / 6902 tests passed; `npx tsc --noEmit -p tsconfig.json` and `--project tsconfig.tools.json` both clean.

## What changed

- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`: `UNIFORM_BYTES` 256→272 (comment updated); `upload()` computes `voxelSizeLocal = 1 / Math.max(...cube.dims)` and stores it on the `FieldEntry`; `draw()` gained a `pixelConeTan: number` positional parameter (after `cameraPosWorld`, before `settingsOf`) and writes `scratch[64] = e.voxelSizeLocal`, `scratch[65] = pixelConeTan`; byte-offset comment table extended with rows 256..271 (`voxelSizeLocal`, `pixelConeTan`, `_pad2`, `_pad3`).
- `src/@types/rendering/FieldEntry.d.ts`: added `voxelSizeLocal: number` with a doc comment (per-cube static, same treatment as `contrastCenter`).
- `src/@types/rendering/VolumeFieldRenderer.d.ts`: `draw()` signature gained the `pixelConeTan` parameter + doc note.
- `src/services/engine/frame/passes/scalarVolumeLayer.ts`: computes `pixelConeTan = (2 * Math.tan(ctx.fovYRad / 2)) / vh` at the draw call site (derivation comment colocated, mirrors `drawPxPerRad` from `frameContext.ts:177` but inverted to a per-pixel tangent against the downscaled `vh`) and passes it through.
- `src/services/gpu/shaders/scalarVolume/fragment.wesl`: `VolumeUniforms` struct gained `voxelSizeLocal: f32` and `pixelConeTan: f32` after `frame`, with unit/space doc comments. No shader logic touched — WGSL's automatic mat4-alignment padding brings the struct to 272 bytes without any explicit pad fields, matching `UNIFORM_BYTES`.
- Tests: `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` — 8 `draw()` call sites given the new positional arg (`0.001` placeholder), `uniformScratch` filter widened 64→68, new parity test asserting offsets 64/65 (`voxelSizeLocal=0.25` for the `[4,4,4]` fixture, hand-computed independently; `pixelConeTan` passed through unchanged).

## Consequential fixes (not in the original file list, but direct fallout of the signature change to `scalarVolumeLayer.ts`/`volumeFieldRenderer.ts`, required to keep the suite green)

- `tests/services/engine/frame/passes/scalarVolumeLayer.test.ts`: updated arg-index assertions (settingsOf/fadeOpacityOf shifted from args 4/5 to 5/6) and added an assertion on `pixelConeTan` at arg 4 (hand-computed `2*tan(fovYRad/2)/vh` against the fixture's `fovYRad=60°`, `vh=240`).
- `tests/visual/renderFrameSplitBaseline.test.ts`: one inline-snapshot line (`argShape` for the `scalar-volume` renderer's draw call) updated via `vitest -u`; diff confirmed to be exactly the expected `...,Array[3],number,function,function` shape change, nothing else.

## Verification

- Confirmed via `tsc --noEmit` on both `tsconfig.json` and `tsconfig.tools.json` that `scalarVolumeLayer.ts` is the sole production call site of `VolumeFieldRenderer.draw()` — no other file needed touching, per the brief's stop-and-report guard.
- Ran the two directly-relevant test files first (9 + 7 tests green), then the full suite (6902 tests green) to catch the two consequential snapshot/index fixes above.

## Concerns

None. No visual gate for this task (uniform pads are unread by shader logic) — Tasks 5/6 are the consumers.

---

## Fix round 1 — review findings

**Status:** DONE

**Fix commit:** `7a0521f06fe5ff67efe0c0b0e60523f4e8ac1c8d`

Two Important findings addressed, one Minor (comment wording, same fix bundled in):

1. **`volumeFieldRenderer.ts` — pads not explicitly zeroed.** `scratch[66]`/`scratch[67]` (the new `_pad2`/`_pad3` at bytes 264..271) were left to Float32Array zero-init even though `scratch` is reused across the field loop within one `draw()` call — the exact hazard the existing `scratch[18]`/`scratch[19]` zeroing (and its comment) exists to prevent. No live bug today (nothing else in the loop ever writes 66/67), but the convention is "every pad slot gets an explicit writer," not "only pads a future write is known to threaten." Added `scratch[66] = 0; scratch[67] = 0;` alongside the other scratch writes, with a comment pointing at the existing convention.

2. **`scalarVolumeLayer.test.ts` — banned mirror test.** The `pixelConeTan` assertion in "draws with the SlabView vp/camPos and the downsampled viewport" computed its expectation with the exact same expression the production code uses (`(2 * Math.tan(ctx.fovYRad / 2)) / vh`) — a mirror, not a keep-rule test; it would pass even if the formula's derivation were wrong, only catching a copy-paste slip. Split into its own test, `'computes pixelConeTan from fovYRad and the downsampled viewport height'`, using a hand-friendly fixture (`fovYRad = π/2` so `tan(fovYRad/2) = tan(π/4) = 1` exactly; `canvasSize.height = 300` so `vh = floor(300/3) = 100`) and asserting the literal `0.02` (`= 2 * 1 / 100`, computed on paper, shown in the test comment). The original test now only asserts the pass/vp/viewport/camPos args (unchanged from before this fix).

3. **`scalarVolumeLayer.ts` — wrong justification in the derivation comment (Minor).** "(small-angle, tan ≈ angle)" was wrong: the formula is exact, not an approximation — perspective projection is linear in tan-space, so dividing the full `tan(fovYRad/2)` span evenly by pixel count gives each pixel's tangent exactly, with no small-angle assumption anywhere. Reworded in place; comment structure unchanged. (Note: this comment lives in `scalarVolumeLayer.ts`, not `volumeFieldRenderer.ts` as the finding said — the wording issue is the one described, just in the actual file that holds the `pixelConeTan` derivation.)

### Verification

- `npx vitest run tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts tests/services/engine/frame/passes/scalarVolumeLayer.test.ts` → 2 files, 17 tests, all green (one new test added by the split).
- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts` → still green (arg count/types unaffected by pad zeroing or comment wording).
- Full suite: `npx vitest run` → 1023 test files / 6903 tests passed (one more than the prior round's 6902, from the new split test).

### Files changed this round

- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (pad zeroing)
- `src/services/engine/frame/passes/scalarVolumeLayer.ts` (comment wording)
- `tests/services/engine/frame/passes/scalarVolumeLayer.test.ts` (mirror test split into a hand-computed literal)
