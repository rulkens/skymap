# Pick resolved galaxy disks from the procedural-disk pipeline

## Goal

Make the pick surface for a resolved galaxy match its on-screen disk (and the
disk-radius debug ring) **exactly**, by picking from the procedural-disk
pipeline instead of reconstructing the ellipse on the point sprite. Then
simplify the point-sprite pick back to a plain dot.

### Why (background)

Picking currently rides entirely on the POINT sprite billboard:
`pickRenderer.ts` re-renders the point pipeline into an `r32uint` texture. For a
galaxy that has crossed into the resolved-disk regime, the point pick fragment
(`src/services/gpu/shaders/points/pickFragment.wesl`) tries to reconstruct the
galaxy disk ellipse on a screen-aligned billboard from two varyings
(`pickMajorBillboard`, `pickMinorBillboard`) plus an `isDiskHandoff` flag set in
`points/vertex.wesl`, with the basis projected from `radiusMpc`. This is:

- **a perf cost on the hot, shared point vertex stage** — two extra `worldToClip`
  calls and two extra flat varyings on a stage that runs for ~2.5M point sprites
  per frame; and
- **buggy** — it draws a square/oversized circle that doesn't match the ring and
  doesn't foreshorten.

The realization: the procedural-disk renderer already draws the exact disk with
correct world-space geometry, and the debug ring uses the identical math. By
construction, **ring == procedural disk edge == desired pick surface**:

- `src/services/gpu/shaders/proceduralDisks/vertex.wesl` builds the quad from
  `halfWorld = posSize.w * 0.5` and `diskAxes(pos, paRad, cosI=max(axisRatio,0.05), sinI)`.
- `proceduralDiskSubsystem.ts:187` sets `sizeWorldMpc = paddedRadiusMpc(dKpcRow) * 2`,
  so `halfWorld == paddedRadiusMpc`.
- `proceduralDisks/fragment.wesl:57` discards at `length(in.uv) > 1.0` — the
  visible disk edge is the inscribed unit-circle ellipse.
- `diskRadiusRingPass.ts:66` draws the ring at `paddedRadiusMpc(diameterKpc)` with
  the same `diskAxes`.

So the fix is to add a pick fragment to the procedural-disk pipeline that reuses
its existing vertex stage and discards at `length(uv) > 1.0`, writing the packed
identity; then strip the ellipse machinery off the point pick and clamp it to a
plain dot.

## Architecture

- **Procedural disks own resolved-disk picking.** Add a pick fragment to the
  procedural-disk pipeline (reusing its vertex stage), thread the packed
  `(source, localIdx)` identity onto each procedural instance, expose a
  `pickDisks(pass)` method on the procedural-disk renderer, and call it from
  `pickRenderer.recordPickPass` — the exact pattern already used for
  `structureMarkerRenderer.pickRing(pass)`.
- **Points own dot picking.** In the pick pass the point billboard clamps to the
  dot-floor size and the point pick fragment becomes a plain `dot(uv,uv) <= 1.0`
  circle. The ellipse reconstruction (`pickMajorBillboard` / `pickMinorBillboard`
  / `isDiskHandoff`) is deleted from `points/io.wesl`, `points/vertex.wesl`, and
  `points/pickFragment.wesl`.
- **Shared depth means front-most wins.** The point dot and the disk for the SAME
  galaxy carry the SAME packed id, so any overlap between the two passes is
  harmless.

The de-complecting in one line: **the point pass picks dots; the procedural pass
picks disks.** No shader branches on which regime a galaxy is in.

## Tech Stack

- TypeScript + Vite, raw WebGPU + WESL (wesl-plugin `?static` linker).
- Tests: vitest (`npm test`). Typecheck: `npm run typecheck`. Shader linking is
  verified by `npm run build`.
- Project conventions (these override defaults): `type` aliases never `interface`;
  one type per file under `src/@types/<area>/`; single-function utility files
  named after the export; comments timeless + terse (no dates / PR refs); commit
  messages end with a `Co-Authored-By` trailer only (never `--author`); stage
  specific paths (never `git add -A`); work happens in the
  `worktree-pick-disk-from-procedural` worktree.

## For agentic workers

**REQUIRED SUB-SKILL: `superpowers:test-driven-development`** — every task below is
written as failing-test-first. When editing `.wesl`, also follow the
`wesl-shaders` skill (no backticks in comments; `package::` import prefix; WGSL
struct layout). Run bash sequentially (a permission denial cancels a parallel
batch) and use Read/Grep tools rather than `sed`/`awk`/`grep` via Bash.

### Contract reference (verified against current code)

- `cloudSource` in `proceduralDiskSubsystem.ts` IS the numeric `SourceType`
  (`Source.SDSS` = 1, etc. — `sources.ts:44`), so the pick source code is
  `cloudSource` directly. `i` (the inner-loop catalog row index) is `localIdx`.
- Packed id: `packSelection(sourceCode, localIdx)` returns a `u32`
  (`src/data/selectionEncoding.ts:67`). The pick fragment writes
  `packed + PICK_SENTINEL_OFFSET` (offset = 1).
- WESL mirror: `lib/selectionEncoding.wesl` exports `fn packSelection` and
  `const PICK_SENTINEL_OFFSET: u32 = 1u` — import these, don't open-code.
- Procedural instance stride: 64 bytes / 16 floats
  (`instancedQuadRenderer.ts` `FLOATS_PER_INSTANCE = 16`). Slots written by
  `proceduralDiskRenderer.draw`: 0–3 posSize, 4 axisRatio, 5 positionAngleDeg,
  **6 = 0, 7 = 0**, 8 colourIndex, 9 crossfadeAlpha, 10 procFadeOut, 11 = 0,
  12–15 = 0 (texturedDisk's hi-res slot). **Slot 6 is free** — we claim it for the
  packed id.
- `localIdx` can exceed 2^24 and is therefore NOT exactly representable as an
  `f32`. The renderer must write the **u32 bits** into slot 6 via a `Uint32Array`
  view over the same `ArrayBuffer` as the `Float32Array` pack buffer — NOT store
  the integer as a float value. The shader reads it back with
  `bitcast<u32>(instance.orientation.z)`.
- `createInstancedQuadRenderer` builds ONE visual pipeline + instance buffer and
  exposes only `draw` (plus optional atlas binders). It does NOT expose its
  pipeline, instance buffer, or BGL to the consumer. The procedural renderer
  therefore cannot reuse the factory's private instance buffer for a second
  (pick) pipeline. **Decision:** `proceduralDiskRenderer` builds its OWN pick
  pipeline + retains its OWN copy of the per-frame instance bytes/count (a small
  second GPU buffer it owns), uploaded from the same packed `Float32Array` the
  visual `draw` already produces. (Mirrors how `structureMarkerRenderer` owns its
  instance buffer and feeds both visible + pick pipelines from it.)
- `createPickRenderer` (`pickRenderer.ts:65`) already takes an optional trailing
  `structureMarkerRenderer`; we add an analogous optional
  `proceduralDiskRenderer`. Construction site: `phases/wireInput.ts:54`.

---

### Task 1 — Carry `sourceCode` / `localIdx` on the procedural instance

**Files:**
`src/@types/rendering/ProceduralDiskInstance.d.ts` (modify),
`src/services/engine/subsystems/proceduralDiskSubsystem.ts` (modify),
`tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts` (modify).

**Type contract** — append two readonly-style fields to `ProceduralDiskInstance`:

```ts
export type ProceduralDiskInstance = {
  // ...existing fields...
  /** Source code (numeric SourceType) of the galaxy this disk represents. */
  sourceCode: number;
  /** Per-source catalog row index — the localIdx half of the packed pick id. */
  localIdx: number;
};
```

`maybeEmitProceduralDisk` is the pure builder of the instance — extend its
signature to accept `sourceCode` and `localIdx` and set them on the returned
object. The subsystem inner loop passes `cloudSource` and `i`. The famous-WebP
override site (`{ ...emitted, procFadeOut: ... }`) already spreads `emitted`, so
the new fields flow through unchanged.

- [ ] Add a test `emits the (source, localIdx) identity for each instance`:
  build a 4-row `makeDenseCloud` under `Source.SDSS` with `decimationFactor: 1`,
  run one frame, and assert every emitted instance has `sourceCode === Source.SDSS`
  and that the set of `localIdx` values equals `{0,1,2,3}`. (Note: the back-to-front
  sort reorders instances, so assert on the set, not positional order.)
- [ ] Run it (`npm test -- proceduralDiskSubsystem`) — fails (fields absent).
- [ ] Extend `maybeEmitProceduralDisk` + the call site + the type.
- [ ] Update the existing `fakeProceduralInstance` factory in
  `tests/services/gpu/renderers/proceduralDiskRenderer.test.ts` to include the two
  new fields (so its `ProceduralDiskInstance` literal still type-checks).
- [ ] `npm test -- proceduralDiskSubsystem` → new + existing tests pass.
- [ ] `npm run typecheck` clean.
- [ ] Commit.

---

### Task 2 — Pack the u32 id into instance slot 6 + retain the buffer for picking

**Files:**
`src/services/gpu/renderers/proceduralDiskRenderer.ts` (modify),
`tests/services/gpu/renderers/proceduralDiskRenderer.test.ts` (modify).

**Packing contract:** in `draw`'s pack loop, slot 6 (`o + 6`) currently holds a
literal `0`. Replace it with the packed pick id written as **u32 bits**, via a
`Uint32Array` view aliasing the SAME `ArrayBuffer` as the `Float32Array packed`:

- `const packed = new Float32Array(instances.length * FLOATS_PER_INSTANCE)`
- `const packedU32 = new Uint32Array(packed.buffer)`
- per instance: `packedU32[o + 6] = packSelection(ins.sourceCode, ins.localIdx)`

Slot 6 is byte offset `6 * 4 = 24` within each 64-byte instance — i.e. the
`.z` component of the location-1 `vec4<f32>` (`orientation`) the shader reads.

**Retention contract:** the renderer must keep the last-uploaded instance bytes +
count available to a pick pass. Since the visual pipeline + instance buffer are
private to the `instancedQuadRenderer` factory, `proceduralDiskRenderer` allocates
and owns a SECOND grow-on-demand GPU buffer (the "pick instance buffer"), writes
the same `packed` bytes into it inside `draw`, and records the instance count.
`pickDisks` (Task 4) draws from this owned buffer. Keep it byte-identical to the
visual buffer so the shared vertex stage reads the same data.

- [ ] Add a test `pack writes the packed pick id into slot 6 as u32 bits`:
  construct the renderer with the stub device, draw two instances with distinct
  `sourceCode`/`localIdx` (e.g. `{sourceCode: 1, localIdx: 7}` and
  `{sourceCode: 3, localIdx: 1_000_000}`), grab the instance `writeBuffer` payload,
  reinterpret it as `Uint32Array` (via `new Uint32Array(payload.buffer)`), and
  assert `u32[6] === packSelection(1, 7)` and `u32[16 + 6] === packSelection(3, 1_000_000)`.
  Import `packSelection` from `src/data/selectionEncoding`.
- [ ] Note in the test that `1_000_000` proves the float-vs-bits distinction
  matters (`1_000_000` IS f32-representable but a value like `0x07ffffff` would
  not round-trip if stored as a float — keep the assertion on the exact bits).
- [ ] Run it — fails (slot 6 is zero).
- [ ] Implement the `Uint32Array`-view pack + the owned pick instance buffer.
- [ ] Keep the existing "slots 12..15 are zero pad" test green (slot 6 is no
  longer asserted-zero there; if that test asserts slot 6 == 0, update it to the
  new packed expectation rather than deleting the assertion).
- [ ] `npm test -- proceduralDiskRenderer` → green.
- [ ] Commit.

---

### Task 3 — Procedural pick shader (VsOut.pickId + bitcast + pickFragment.wesl)

**Files:**
`src/services/gpu/shaders/proceduralDisks/io.wesl` (modify),
`src/services/gpu/shaders/proceduralDisks/vertex.wesl` (modify),
`src/services/gpu/shaders/proceduralDisks/pickFragment.wesl` (new).

**io.wesl** — add a flat `pickId` to `VsOut`:

```wgsl
@location(5) @interpolate(flat) pickId: u32,
```

(Locations 0–4 are taken; use 5. The visual `fs` declares fewer inputs, so the
WGSL linker drops the unused varying on the visual pipeline.)

**vertex.wesl** — slot 6 is `instance.orientation.z`. Set the varying:

```wgsl
out.pickId = bitcast<u32>(instance.orientation.z);
```

Import `packSelection` is NOT needed here (the id was packed CPU-side). No new
`worldToClip` calls — this is a single bitcast on a stage that already runs for
only a few resolved disks per frame, so adding the varying is acceptable (the perf
concern is the POINT stage, not this one).

**pickFragment.wesl** (new) — discards outside the unit-circle ellipse (matching
the visual fragment's `length(in.uv) > 1.0`, with NO forgiveness margin so the
pick edge is the disk edge), then writes the offset packed id:

- imports: `package::proceduralDisks::io::VsOut`,
  `package::lib::selectionEncoding::PICK_SENTINEL_OFFSET`.
- body contract: `if (length(in.uv) > 1.0) { discard; }` then
  `return vec4<u32>(in.pickId + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);`
- entry point name: `fsPick` (match the pick-fragment naming the renderer will
  reference in Task 4).
- Declare NO bindings (the fragment reads only `VsOut` fields) — same rationale as
  the existing `proceduralDisks/fragment.wesl` header.

- [ ] Add the three shader edits / file.
- [ ] `npm run build` → `tsc --noEmit` + vite build succeed (the wesl-plugin
  links `pickFragment.wesl`; a parse error or unresolved `package::` import fails
  here). This is the acceptance gate for the task — there is no runtime test for
  shader source.
- [ ] Commit.

---

### Task 4 — Procedural pick pipeline + `pickDisks(pass)`, wired into the pick pass

**Files:**
`src/@types/rendering/ProceduralDiskRenderer.d.ts` (modify),
`src/services/gpu/renderers/proceduralDiskRenderer.ts` (modify),
`src/services/gpu/renderers/pickRenderer.ts` (modify),
`src/services/engine/phases/wireInput.ts` (modify),
`tests/services/gpu/renderers/pickRenderer.poi.test.ts` (modify or add sibling).

**Renderer API contract** — add to `ProceduralDiskRenderer`:

```ts
/**
 * Draw the retained procedural-disk instances into the active pick
 * render pass using the r32uint pick pipeline. No-op until `draw` has
 * uploaded at least one instance this frame. Caller (pickRenderer) has
 * already bound @group(0) camera + @group(1) focus state.
 */
pickDisks(pass: GPURenderPassEncoder): void;
```

**Pick pipeline contract** (built inside `createProceduralDiskRenderer` against a
SEPARATE `GPUShaderModule` pair — vertex from `proceduralDisks/vertex.wesl`,
fragment from the new `pickFragment.wesl`):

- Reuse the SAME explicit pipeline layout the visual pipeline uses
  (`[bindGroupLayout(@group0 uniforms), focusBgl(@group1)]`) so the caller's bound
  groups are layout-compatible. The factory builds those layouts privately, so
  the renderer needs access to them — pass the procedural renderer the
  `focusBgl` it already receives in `Init`, and build a matching `@group(0)`
  uniform BGL + uniform buffer locally for the pick pipeline (the pick pipeline
  needs the camera `viewProj` to project the quad, same as the visual one).
  *Sequence the implementation to read the visual pipeline's binding numbers
  first and mirror them exactly; if the visual layout cannot be reused cleanly,
  STOP and report rather than inventing a divergent layout.*
- Fragment target `{ format: 'r32uint' }`, no blend.
- `depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }`
  — same as the galaxy + ring pick pipelines, so it shares depth with them inside
  the one pick pass (front-most wins).
- `pickDisks` writes the pick uniform buffer (viewProj/viewport/camPos/pxPerRad —
  the same values `draw` was last given; cache them in `draw`), sets the pick
  pipeline + the camera bind group + the focus bind group the caller passes, binds
  the owned pick instance buffer, and emits `draw(6, count)`. If count is 0, no-op.

**Wiring contract** — `pickRenderer.ts`:

- Add an optional trailing `proceduralDiskRenderer?: ProceduralDiskRenderer`
  parameter to `createPickRenderer` (AFTER the existing optional
  `structureMarkerRenderer` — appending keeps the existing positional contract the
  `pickRenderer.poi.test.ts` type test pins).
- In `recordPickPass`, after the `structureMarkerRenderer?.pickRing(pass)` call and
  before `pass.end()`, add `proceduralDiskRenderer?.pickDisks(pass)`.
  Document inline: shared depth means a closer point dot or disk claims the pixel;
  the disk and its companion point carry the SAME packed id, so overlap is
  harmless.
- `wireInput.ts:54` passes `state.gpu.proceduralDiskRenderer ?? undefined` as the
  new trailing arg.

**Test contract** (mirror the type-level style of `pickRenderer.poi.test.ts`,
which can't stand up a live `GPUDevice`):

- [ ] Add a test asserting `createPickRenderer`'s 8th positional
  (`proceduralDiskRenderer`, index 7) exists and is assignable from `undefined`
  (optional), in the same `Parameters<typeof createPickRenderer>` style as the
  existing POI test. This pins the append-not-reorder contract.
- [ ] Add a renderer-level unit test (stub-device style from
  `proceduralDiskRenderer.test.ts`): after a `draw` with N instances, calling
  `pickDisks(stubPass)` issues `stubPass.draw` with vertex count 6 and instance
  count N; and calling `pickDisks` on a fresh renderer (no prior `draw`) is a
  no-op (no `setPipeline`/`draw`).
- [ ] Run the new tests — fail.
- [ ] Implement the pipeline + method + wiring + type field.
- [ ] `npm test -- proceduralDiskRenderer pickRenderer` and `npm run typecheck`
  → green. `npm run build` → links.
- [ ] Commit.

---

### Task 5 — Simplify the point pick to a plain dot

**Files:**
`src/services/gpu/shaders/points/vertex.wesl` (modify),
`src/services/gpu/shaders/points/io.wesl` (modify),
`src/services/gpu/shaders/points/pickFragment.wesl` (modify),
`src/@types/settings/EngineSettingsState.d.ts` (modify),
`src/services/gpu/renderers/pickRenderer.ts` (doc comment only).

**vertex.wesl:**

- In the pick pass, clamp the billboard to the dot floor. Currently
  `let sizePx = max(u.pointSizePx, apparentPxRadius);` (line ~152). The pick pass
  must NOT inflate to the apparent-size circle. Contract: when `u.pickPass == 1u`,
  use `u.pointSizePx` as the half-extent; otherwise keep
  `max(u.pointSizePx, apparentPxRadius)`. (The procedural pass now owns
  resolved-disk picking, so the point pass only needs to claim a small dot.)
- Delete the entire `if (inPickPass && isDiskHandoff) { ... } else { ... }` block
  (lines ~292–324) that computes `pickMajorBillboard` / `pickMinorBillboard`.
- Delete the `isDiskHandoff` local + `out.isDiskHandoff = ...` write (lines
  ~283–284).
- Remove the now-unused `import package::lib::orientation::diskAxes;` (line 38) —
  verify no other reference to `diskAxes` remains in this file after the deletions
  (grep confirms the only uses are the deleted block).
- Leave the `inPickPass` local in place — it is still used by `crossfadeOut`, the
  invisibility cull, and the focus pick-exclusion.

**io.wesl** — remove from `VSOut` the three fields no fragment reads anymore:
`isDiskHandoff` (`@location(4)`), `pickMajorBillboard` (`@location(5)`),
`pickMinorBillboard` (`@location(6)`). After removal, `paRotation` stays at
`@location(3)` (the visual fragment uses it); no renumbering of the remaining
locations is required.

**pickFragment.wesl** — replace the whole `isDiskHandoff` branch + the
`r2 > 2.25` (1.5x forgiveness) test with a single plain circle test:

```wgsl
if (dot(in.uv, in.uv) > 1.0) { discard; }
```

Then keep the existing
`return vec4<u32>(in.instanceIdx + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);`. Update the
file header comment to describe the plain-dot behaviour (drop the disk-handoff /
forgiveness-ellipse narrative).

**EngineSettingsState.d.ts** — the `showPickBuffer` doc block (lines ~163–168)
mentions "the 1.5x forgiveness ellipse/circle baked into pickFragment.wesl". Update
it to describe the new behaviour: the point pass picks a `pointSizePx`-clamped dot,
and resolved galaxy disks are picked by the procedural-disk pass at the disk edge.

**pickRenderer.ts** — the module header (lines ~17–19) says "`pickFragment.wesl`'s
1.5x forgiveness radius makes each pick billboard a bit larger than its visible
disk." Replace with a note that the point pick is a plain dot clamped to the size
floor and resolved disks are picked by the procedural pass.

**Tests:**

- [ ] Search `tests/` for any assertion referencing `isDiskHandoff`,
  `pickMajorBillboard`, `pickMinorBillboard`, or the `2.25` forgiveness constant.
  If present, update those tests to the plain-dot contract; if absent, note that
  point-pick shape is verified visually (no unit test stands up the GPU pick
  pass). The acceptance is `npm run build` (shader links) + `npm test` green.
- [ ] `npm run build` → links (the removed varyings must be gone from BOTH the
  vertex output and every fragment input, or the WGSL compiler errors).
- [ ] `npm test` → full suite green.
- [ ] Final behaviour is visual: with the pick-debug overlay
  (`debug.showPickBuffer`) on, the picked region for a resolved galaxy matches the
  disk-radius ring (`debug.showDiskRadiusRing`). Ask the user to confirm in the
  running dev server.
- [ ] Commit.

---

### Final task — Entanglement-radar pass over the diff

**Files:** none (review only).

The project bakes a simplicity review into every plan. The de-complecting claim is
**"the point pass picks dots; the procedural pass picks disks"** — confirm the diff
delivers it without introducing a new knot.

- [ ] Run the `entanglement-radar` skill over the full diff of this branch.
- [ ] Specifically verify: no shader branches on a galaxy's LOD regime in the pick
  path anymore; the packed-id slot choice (slot 6) is documented at both the pack
  site and the shader read; the procedural renderer's owned pick instance buffer is
  not a stale mirror of the factory's visual buffer (it is re-uploaded every frame
  from the same `packed` bytes, so there is no second source of truth).
- [ ] Address any knot it names, or record why it's acceptable, in the review
  output (no new file — report inline).

---

## Out of scope (follow-up, not a task here)

Famous galaxies with a loaded curated WebP render via the **textured** disk with
**calibrated** tilt/size (`texturedDiskSubsystem.ts` uses `effectiveTilt` +
`calibratedDiskSizeWorld`), and their ring uses `effectiveTilt` too. Matching
THEIR ring exactly needs the same pick fragment on the **textured-disk** pass.
This plan lands procedural-disk picking first — it covers every non-curated galaxy
(the reported "all galaxies" case). Textured-disk picking is a fast follow once
this is green.
