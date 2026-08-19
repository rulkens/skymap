# Task 4 review — uniform bump 256 → 272

## Spec ✅

All binding constraints verified against the diff (`review-6e93d14af..7ecdd6905.diff`) and the live tree:

- `UNIFORM_BYTES` is exactly `272`; comment table extended with `256..259 voxelSizeLocal`,
  `260..263 pixelConeTan`, `264..267 _pad2`, `268..271 _pad3`, verbatim per the brief's contract.
- WGSL struct field order matches the TS scratch writes: `scratch[64] = e.voxelSizeLocal` /
  `scratch[65] = pixelConeTan` land at byte 256/260, and `voxelSizeLocal`/`pixelConeTan` are the
  last two `VolumeUniforms` fields in `fragment.wesl`, in the same order. Hand-verified the total
  struct size: `cameraPosWorld`(208)+11×f32 up to `pixelConeTan` ends the struct at byte 264;
  WGSL's alignment-16 rule (forced by the embedded `mat4x4`s) rounds that up to 272 with **no
  explicit pad fields needed** — this mirrors the existing precedent where `CameraUniforms`'
  own `_pad0`/`_pad1` (72..79) are likewise implicit end-of-struct padding, not literal WGSL
  fields. `UNIFORM_BYTES` and the WGSL struct size agree.
- `voxelSizeLocal = 1 / Math.max(cube.dims[0], cube.dims[1], cube.dims[2])`, computed once in
  `upload()`, stored on `FieldEntry` — matches the brief's formula and per-cube-static treatment.
- `pixelConeTan` computed in `scalarVolumeLayer.ts` from `ctx.fovYRad` and the **local**
  downscaled `vh` (not canvas height) — `(2 * Math.tan(ctx.fovYRad / 2)) / vh`, with the
  derivation comment colocated at the computation site. **Hand-verified the formula**: it's the
  exact reciprocal-shape of `drawPxPerRad = canvasSize.height / (2*tan(fovYRad/2))`
  (`frameContext.ts:177`, confirmed by reading that line), which is what the brief asked for.
  Sanity check at vh=300, fovY=1.0 rad: `2*tan(0.5)/300 = 0.0036420` — matches the expected
  order of magnitude from the brief's own idiom.
- `draw()` gained `pixelConeTan: number` positioned immediately after `cameraPosWorld`, before
  `settingsOf`, in both `volumeFieldRenderer.ts` and `VolumeFieldRenderer.d.ts` — exact match to
  the brief's signature.
- `type`, not `interface`, throughout (all edits are additions to existing `export type` blocks).
- All ≈9 `r.draw(...)` call sites in `volumeFieldRenderer.test.ts` updated with the new
  positional arg (grepped: 9 call sites, 9 placeholder/value insertions, no stale site).
  `uniformScratch`'s length filter widened 64→68.
- New parity test asserts `voxelSizeLocal=0.25` (hardcoded literal, independent of the
  renderer's own `Math.max` call) and `pixelConeTan` passthrough at offsets 64/65 — legitimate
  keep-rule test, not a mirror (there's no formula to mirror on the `pixelConeTan` side, it's a
  pure plumbing check).
- Verified independently: `npx tsc --noEmit` on both `tsconfig.json` and `tsconfig.tools.json`
  clean; `grep`-confirmed `scalarVolumeLayer.ts` is the sole production call site of
  `VolumeFieldRenderer.draw()`; ran the three touched test files directly (17 tests, all green).

No missing pieces against the brief's checklist.

## Quality verdict: Approve with two Important findings

### Important — `scratch[66]`/`scratch[67]` (`_pad2`/`_pad3`) not explicitly zeroed

`volumeFieldRenderer.ts:571-572` explicitly zeros `scratch[18]`/`scratch[19]` every field-loop
iteration with the comment *"the scratch is reused across the field loop, so the pads can't rely
on Float32Array zero-init"* — an established, deliberate convention for pads in this exact reused
buffer (also documented from the other side in `cameraUniforms.ts:26-28`: "larger-struct callers
that reuse scratch across frames zero the pads explicitly themselves"). The new pads at indices
66/67 (bytes 264..271) get no equivalent treatment anywhere in the loop.

As shipped this is **provably inert today** — `scratch` is a fresh `new Float32Array(...)`
allocated once per `draw()` call (`:534`, before the field loop) and nothing in the file ever
writes a non-zero value to 66/67, so they stay 0 for every field on every call. But this is
exactly the landmine class the task brief's review scrutiny flagged, and the omission is
inconsistent with the pattern the surrounding code goes out of its way to establish and comment
on for 18/19 — a future field addition or refactor that starts writing 66/67 conditionally (e.g.
gated on a per-field flag, mirroring how palette residency is conditional) would silently
reintroduce the exact stale-scratch bug the 18/19 comment warns about, with no test or comment
signalling that 66/67 need the same discipline. One-line fix: `scratch[66] = 0; scratch[67] = 0;`
next to the existing pad zeroing.

### Important — mirror-test scope creep in `scalarVolumeLayer.test.ts`

The "consequential fixes" section added a new assertion, not just an arg-index update:

```ts
const vh = Math.floor(720 / VOLUME_SCALE);
expect(args[4]).toBeCloseTo((2 * Math.tan(ctx.fovYRad / 2)) / vh);
```

This copies the production formula verbatim (`scalarVolumeLayer.ts:71`:
`(2 * Math.tan(ctx.fovYRad / 2)) / vh`), using the same `ctx.fovYRad` and derived `vh`, not a
hand-computed literal. This is the exact anti-pattern named in
`docs/superpowers/conventions/testing.md:71-76` ("No MIRROR tests" — importing/copying the
source's own formula into the expectation makes the assertion a tautology, can't catch a wrong
formula). It also goes beyond what the review brief scoped as legitimate fallout for this file
("signature fallout is legitimate; anything beyond arg-index/snapshot updates is scope creep").
The task's own required parity test (in `volumeFieldRenderer.test.ts`) correctly avoided this
trap for `voxelSizeLocal` by hand-computing `0.25`; the same discipline should have applied here
— e.g. assert `args[4]` is a `number` (arg-shape only, matching what the brief actually asked
for), or hand-derive a literal expected value from the fixture's concrete `fovYRad`/`vh` instead
of re-deriving it programmatically.

### Minor — derivation comment's "small-angle" framing is inaccurate

`scalarVolumeLayer.ts:69` parenthetical `(small-angle, tan ≈ angle)` mischaracterises the
derivation. The formula `2*tan(fovYRad/2)/vh` is **exact**, not a small-angle approximation:
perspective projection maps `tan(θ)` linearly to screen/pixel space (that's how the projection
matrix works — `y_ndc = y / (z·tan(halfFovY))`), so a fixed pixel step corresponds to a fixed
step in tan-space exactly, at any FOV, not just for small angles. The formula itself is correct
(hand-verified above); only the justification is off. Low risk today, but a comment recording an
incorrect derivation is exactly the kind of thing that misleads a future reader per this
project's comment conventions (comments should record a derivation correctly, not approximately).
Would tighten to something like "(exact: screen space is linear in tan(θ), not θ itself)".

### Everything else checked and clean

- `fragment.wesl`: only the two new `VolumeUniforms` fields + doc comments added, no logic
  touched, confirmed by reading the file directly.
- Comment density on the new `FieldEntry.d.ts`/`VolumeFieldRenderer.d.ts`/`volumeFieldRenderer.ts`
  additions is high but matches this codebase's established per-field convention in these exact
  files (sibling fields like `contrastCenter`/`envelopeInner` carry similarly long derivation
  comments) — not flagged as a budget violation.
- `renderFrameSplitBaseline.test.ts` change is a pure inline-snapshot update reflecting the
  argShape string change (`...,Array[3],number,function,function`), nothing else touched —
  legitimate signature fallout.
- Full suite / typecheck claims in the report independently re-verified (ran the three touched
  test files: 17/17 green; both `tsc --noEmit` configs: clean).

## ⚠️ Cannot-verify

- Did not re-run the full 6902-test suite (ran only the three files this task touches plus both
  typecheck configs) — took the report's full-suite claim on faith beyond that scope.
