# Shared vertex attribute layout (H2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PointRenderer` the single source of truth for the per-instance vertex buffer's attribute table and have `PickRenderer` import it directly, so the two pipelines can never drift apart on byte offsets / shader locations.

**Architecture:** Export `POINT_STRIDE` and a new `POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[]` from `pointRenderer.ts`. Refactor `pointRenderer`'s own pipeline declaration to consume the same const (so production exercises the shared definition, not just `pickRenderer`). Replace `pickRenderer.ts`'s inline 10-row attribute literal with the import. Add one test that asserts both renderers' pipelines, when built, see a structurally identical attribute table — caught at module load time, not at WebGPU draw-time validation.

**Tech Stack:** TypeScript, WebGPU, vitest.

---

## Background

Today `src/services/gpu/renderers/pointRenderer.ts` declares 7 named byte-offset constants (`K_PER_Z_BYTE_OFFSET = 20`, `AXIS_RATIO_BYTE_OFFSET = 24`, …, `ANGULAR_WEIGHT_BYTE_OFFSET = 44`) at the top of the file with rich JSDoc, then uses them inside an inline `attributes: [ … ]` literal at the pipeline declaration (around line 747).

`src/services/gpu/renderers/pickRenderer.ts:304-320` repeats the same 10-attribute table with **raw magic numbers** (`0, 12, 16, 20, 24, 28, 32, 36, 40, 44`) and a header comment that says "must exactly match PointRenderer's layout (12 slots × 4 bytes = 48 bytes per instance)". The comment is the only safety rail — a missed edit silently fails at draw-time pipeline validation or, worse, reads garbage attributes.

The intent of H2 is to make pickRenderer **literally import** the same array. No new file; no abstraction layer. The named offset constants stay (they carry per-slot JSDoc that documents the WHY of each attribute) and are referenced inside the new `POINT_VERTEX_ATTRIBUTES` literal, so the docs stay attached to the offsets they describe.

## File map

- **Modify:** `src/services/gpu/renderers/pointRenderer.ts`
  - Add `export` to existing `const POINT_STRIDE`
  - Add new `export const POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[]` near `POINT_STRIDE`
  - Refactor the pipeline declaration's `attributes: [ … ]` literal to use the new const

- **Modify:** `src/services/gpu/renderers/pickRenderer.ts`
  - Import `POINT_STRIDE` and `POINT_VERTEX_ATTRIBUTES` from `./pointRenderer`
  - Replace the inline attribute literal + `arrayStride: 48` with the imports
  - Update the comment that warns "must exactly match PointRenderer's layout" — the imports make it structurally impossible to drift

- **Modify:** `tests/services/gpu/renderers/pickRenderer.test.ts` (if existing test setup makes it natural; otherwise add to `tests/services/gpu/renderers/pointRenderer.test.ts`)
  - Add one test that asserts `POINT_VERTEX_ATTRIBUTES` has the expected shape: length 10, slot 0 is `float32x3`, slots 1-9 are `float32`, offsets are the named-const values

No new files.

---

## Task 1: Export the shared attribute table from `pointRenderer.ts` and add a structural test

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts`
- Test: `tests/services/gpu/renderers/pointRenderer.test.ts`

This task gets the export in place AND switches `pointRenderer`'s own pipeline to consume it. That proves production code paths use the new const before we touch `pickRenderer` in Task 2.

- [ ] **Step 1: Promote `POINT_STRIDE` to an export**

In `src/services/gpu/renderers/pointRenderer.ts`, find:

```ts
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 48 bytes
```

Change to:

```ts
export const POINT_STRIDE = SLOTS_PER_POINT * 4; // 48 bytes
```

- [ ] **Step 2: Add the shared `POINT_VERTEX_ATTRIBUTES` export**

Immediately AFTER the existing `ANGULAR_WEIGHT_BYTE_OFFSET = 44` declaration (which ends at line ~232 — search for `const ANGULAR_WEIGHT_BYTE_OFFSET = 44;` to find the precise location), insert this block. It deliberately uses the named offset constants on the right-hand sides so the per-slot JSDoc above each named constant stays semantically attached to the array entry:

```ts
/**
 * Vertex buffer attribute table — single source of truth shared with
 * `PickRenderer`.
 *
 * Pre-cleanup, `PickRenderer` re-declared this table inline with magic
 * numbers (`0, 12, 16, 20, …, 44`) guarded only by a comment
 * (`// must exactly match PointRenderer's layout`).  A missed edit
 * silently failed at WebGPU draw-time pipeline validation, or worse,
 * read garbage attributes.  Exporting the array and importing it
 * verbatim into `PickRenderer` makes drift structurally impossible —
 * editing one offset propagates everywhere automatically.
 *
 * Slot semantics (see the per-offset JSDoc above for the full rationale):
 *
 *   0  position (vec3<f32>)
 *   1  magnitude (f32)
 *   2  colorIndex (f32)
 *   3  kPerZ (f32) — per-row K-correction; vertex shader × redshift z
 *   4  axisRatio (f32) — b/a; SIGN BIT = isFallback flag
 *   5  positionAngleDeg (f32) — east-of-north major-axis angle, [0, 180)
 *   6  diameterKpc (f32) — per-galaxy physical disk diameter
 *   7  vMaxWeight (f32) — Malmquist mode 2 (1/V_max) multiplier
 *   8  schechterRatio (f32) — Malmquist mode 3 (Schechter) ratio
 *   9  angularDensityWeight (f32) — Malmquist mode 4 (HEALPix) re-weight
 *
 * The right-hand sides reference the named byte-offset constants above
 * so the JSDoc on each constant stays the canonical documentation for
 * its slot.  Position / magnitude / colorIndex use literal offsets
 * (0 / 12 / 16) because they're never read by name elsewhere — only
 * the offsets that the bake or shader-side code needs to address by
 * name get named constants.
 */
export const POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32' },
  { shaderLocation: 2, offset: 16, format: 'float32' },
  { shaderLocation: 3, offset: K_PER_Z_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 4, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 5, offset: POSITION_ANGLE_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 6, offset: DIAMETER_KPC_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 7, offset: VMAX_WEIGHT_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 8, offset: SCHECHTER_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 9, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
];
```

- [ ] **Step 3: Refactor `pointRenderer`'s pipeline to consume the shared const**

Find the pipeline declaration (search for `const pipeline = device.createRenderPipeline({` followed by `label: 'points-pipeline',` — around line 736). Inside `vertex.buffers[0]`, replace the entire inline `attributes: [ … ]` literal (the 10 attributes with inline comments) with a single line. The full replacement for the `buffers` block becomes:

```ts
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          attributes: POINT_VERTEX_ATTRIBUTES,
        },
      ],
```

The per-slot inline comments (`// position (vec3<f32>) — offset 0 bytes`, etc.) move into the docblock on `POINT_VERTEX_ATTRIBUTES` above — they're already there in the slot-semantics list. No information lost.

- [ ] **Step 4: Add a structural sanity test**

In `tests/services/gpu/renderers/pointRenderer.test.ts`, append the following `describe` block at the end:

```ts
describe('POINT_VERTEX_ATTRIBUTES — shared layout export', () => {
  it('has 10 attributes with the expected shader locations and formats', async () => {
    const {
      POINT_VERTEX_ATTRIBUTES,
      POINT_STRIDE,
    } = await import('../../../../src/services/gpu/renderers/pointRenderer');

    expect(POINT_STRIDE).toBe(48);
    expect(POINT_VERTEX_ATTRIBUTES).toHaveLength(10);

    // Slot 0 is the only vec3; slots 1-9 are scalar f32s.  Anyone editing
    // pointRenderer's table must update this expectation deliberately,
    // which is the point — a silent shape change here would break the
    // shared invariant with pickRenderer.
    expect(POINT_VERTEX_ATTRIBUTES[0]).toEqual({
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3',
    });

    const expectedOffsets = [12, 16, 20, 24, 28, 32, 36, 40, 44];
    for (let i = 1; i <= 9; i++) {
      expect(POINT_VERTEX_ATTRIBUTES[i]).toEqual({
        shaderLocation: i,
        offset: expectedOffsets[i - 1],
        format: 'float32',
      });
    }
  });
});
```

The dynamic `await import()` is used instead of a top-of-file import to keep this new test self-contained — the rest of the test file uses a static import and that's fine to keep.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors. `GPUVertexAttribute` is a global ambient type from `@webgpu/types`, no import needed.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — **1062 tests pass** (1061 prior + 1 new). All existing tests still green; the new POINT_VERTEX_ATTRIBUTES test passes.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/renderers/pointRenderer.ts tests/services/gpu/renderers/pointRenderer.test.ts
git commit -m "$(cat <<'EOF'
refactor(pointRenderer): export shared POINT_VERTEX_ATTRIBUTES

Promote POINT_STRIDE to export; introduce POINT_VERTEX_ATTRIBUTES
as the single source of truth for the per-instance attribute table.
pointRenderer's own pipeline consumes it; pickRenderer follows in
the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Switch `PickRenderer` to the shared imports

**Files:**
- Modify: `src/services/gpu/renderers/pickRenderer.ts`

- [ ] **Step 1: Add the import**

In `src/services/gpu/renderers/pickRenderer.ts`, find the existing import that already brings in `SELECTED_PACKED_BYTE_OFFSET` from `./pointRenderer`. Add `POINT_STRIDE` and `POINT_VERTEX_ATTRIBUTES` to that import. If no such import exists yet, add one near the other imports at the top of the file:

```ts
import {
  POINT_STRIDE,
  POINT_VERTEX_ATTRIBUTES,
  SELECTED_PACKED_BYTE_OFFSET,
} from './pointRenderer';
```

(Adjust to merge with any existing import from `./pointRenderer` — don't create a duplicate import statement.)

- [ ] **Step 2: Replace the inline literal**

Find the `vertex.buffers` block in pickRenderer's `createRenderPipeline` call (around lines 304-321 — search for `arrayStride: 48,`). Replace this entire block:

```ts
      // Vertex buffer layout — must exactly match PointRenderer's layout
      // (12 slots × 4 bytes = 48 bytes per instance).  The pipeline
      // shares the SHARED vertex buffer + shader module with PointRenderer;
      // WebGPU validation requires the pick pipeline to declare a layout
      // matching every attribute the buffer carries, even those the pick
      // fragment doesn't read (the SHARED vertex stage still reads them
      // before forwarding into VSOut).
      //
      // Identity encoding: previous revisions had a `globalInstanceIdx
      // u32` at offset 20 carrying a baked running-sum global ID.  Both
      // are gone — the picker now reads `cloud.sourceCode` from the
      // per-source @group(1) bind group and composes each instance's
      // packed identity as `(sourceCode << 27) | @builtin(instance_index)`
      // entirely on the GPU side.  Vertex stride shrank 52 → 48 bytes.
      buffers: [
        {
          arrayStride: 48, // 12 slots × 4 bytes/slot — must match pointRenderer.POINT_STRIDE
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32' }, // magnitude
            { shaderLocation: 2, offset: 16, format: 'float32' }, // colorIndex
            { shaderLocation: 3, offset: 20, format: 'float32' }, // kPerZ
            { shaderLocation: 4, offset: 24, format: 'float32' }, // axisRatio (sign bit = isFallback)
            { shaderLocation: 5, offset: 28, format: 'float32' }, // positionAngleDeg
            { shaderLocation: 6, offset: 32, format: 'float32' }, // diameterKpc
            { shaderLocation: 7, offset: 36, format: 'float32' }, // vMaxWeight
            { shaderLocation: 8, offset: 40, format: 'float32' }, // schechterRatio
            { shaderLocation: 9, offset: 44, format: 'float32' }, // angularDensityWeight
          ],
        },
      ],
```

with:

```ts
      // Vertex buffer layout — imported from PointRenderer as the single
      // source of truth.  Pre-H2 cleanup this block re-declared the table
      // inline with magic numbers; a missed edit silently failed pipeline
      // validation or read garbage attributes.  The imports make drift
      // structurally impossible — both pipelines bind the same const.
      //
      // WebGPU validation requires the pick pipeline to declare a layout
      // matching every attribute the SHARED vertex buffer carries, even
      // attributes the pick fragment doesn't read (the SHARED vertex
      // stage still reads them before forwarding into VSOut).
      //
      // Identity encoding: previous revisions had a `globalInstanceIdx
      // u32` at offset 20 carrying a baked running-sum global ID.  Both
      // are gone — the picker now reads `cloud.sourceCode` from the
      // per-source @group(1) bind group and composes each instance's
      // packed identity as `(sourceCode << 27) | @builtin(instance_index)`
      // entirely on the GPU side.  Vertex stride shrank 52 → 48 bytes.
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          attributes: POINT_VERTEX_ATTRIBUTES,
        },
      ],
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — 1062 tests pass. `pickRenderer.test.ts` exercises pipeline construction with a stub device; if it constructs successfully against the shared const, the test passes structurally.

- [ ] **Step 5: Visual smoke check**

The dev server is already running at http://localhost:5173/. Open it and verify:
- Galaxies still render (point billboards visible)
- Hover/click selection still works (the picker is the only consumer of the pickRenderer pipeline — a broken vertex layout shows as "every hover misses" or "always selects the same galaxy")
- Selection halo appears around the clicked galaxy

If any of these break, do NOT commit — report BLOCKED.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/renderers/pickRenderer.ts
git commit -m "$(cat <<'EOF'
refactor(pickRenderer): consume shared POINT_VERTEX_ATTRIBUTES

Replace the inline 10-attribute literal with the import from
pointRenderer.  Drift between the two pipelines' attribute tables
is now structurally impossible — both pipelines bind the same
exported const.

Closes H2 from the 2026-05-11 architectural audit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verification

- [ ] **Step 1: Final typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Final full test suite**

Run: `npm test`
Expected: 1062 tests pass (was 1061 after H1; +1 from new structural test).

- [ ] **Step 3: Build sanity-check**

Run: `npm run build 2>&1 | tail -20`
Expected: Vite build completes without errors.

- [ ] **Step 4: Visual confirmation**

Confirm with the user (or in the running dev server) that:
- Point billboards still render
- Hover-pick + click-select still work (visual halo appears on the clicked galaxy)
- Toggling `realOnlyMode` / `biasMode` / `highlightFallback` from the SettingsPanel works (these flow through attributes that previously had magic-number offsets — verifies the layout is correct end-to-end)

---

## Self-review notes

- **Spec coverage:** Export added (Task 1 step 2), pointRenderer refactored to consume (Task 1 step 3), pickRenderer switched (Task 2 step 2), structural test added (Task 1 step 4). All four touch points from the file map have at least one step.
- **Placeholders:** None — every step shows exact code or commands.
- **Type consistency:** `POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[]` — the type is `readonly` so a future caller can't mutate it. `GPUVertexAttribute.format` is a string union in `@webgpu/types`; the literal strings (`'float32x3'`, `'float32'`) widen automatically when the literal is annotated with the union type. `POINT_STRIDE` is `number` (computed as `SLOTS_PER_POINT * 4`), used as `arrayStride: POINT_STRIDE`.
- **Why no separate `vertexLayout.ts` file:** the audit's recommendation was to keep the layout in `pointRenderer.ts` and have `pickRenderer.ts` import. Adding a third file would be premature abstraction — there's no other consumer beyond these two renderers, and the bake side uses `SLOTS_PER_POINT` (still kept private).
