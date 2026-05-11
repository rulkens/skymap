# Selection-encoding module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralise the `(sourceCode << 27) | localIdx` packed-identity encoding into one TS module and one WESL module, with a parity test that catches future drift between the two languages.

**Architecture:** A new `src/data/selectionEncoding.ts` exports four constants (`SELECTION_SOURCE_SHIFT`, `SELECTION_LOCAL_IDX_MASK`, `SELECTION_NONE_SENTINEL`, `PICK_SENTINEL_OFFSET`) plus two helpers (`packSelection`, `unpackPick`). A sister `src/services/gpu/shaders/lib/selectionEncoding.wesl` declares the same four constants and a `packSelection` fn. A parity test reads the WESL file as text, regex-extracts each `const NAME: u32 = VALUE;` line, and asserts numerical equality with the TS exports — so any future change to one side that doesn't match the other fails CI. Three TS sites (`pickRenderer.ts` × 2, `pointSpritesPass.ts`) and two WESL sites (`vertex.wesl`, `pickFragment.wesl`) migrate to the new symbols.

**Tech Stack:** TypeScript, WESL (skymap's WGSL-with-imports flavor), Vitest. No new runtime dependencies.

---

## Context for an engineer with no skymap background

skymap encodes a per-galaxy identity into a single 32-bit unsigned integer so the GPU pick texture (r32uint format) can carry it as a single fragment write. The encoding is `(sourceCode << 27) | localIdx` where `sourceCode` is one of the catalog enums in `src/data/sources.ts` (0..31, 5 bits) and `localIdx` is the per-source instance index (0..134M, 27 bits). The picker writes `value + 1` so the texture's cleared-to-zero background pixels remain distinguishable from a real instance-0 hit. The visual shader uses `0xFFFFFFFF` as a "nothing selected" sentinel that no real packed identity can equal (source code 31 is unallocated).

Before this plan: the magic constants `27`, `0x07ffffff`, `0xFFFFFFFF`, and `+1` are open-coded in 3 TS files and 2 WESL files with no shared symbol. Changing the encoding (e.g., bumping to 28 bits of localIdx for billion-point catalogs) requires editing every site, and there is no compile-time or test-time guard that catches partial migrations between TS and WESL.

After this plan: one TS module, one WESL module, one parity test. Adding the cross-language constants doesn't change runtime behavior — it just gives each site a name.

## File Structure

**Create:**
- `src/data/selectionEncoding.ts` — TS source of truth: 4 constants + `packSelection` + `unpackPick`.
- `src/services/gpu/shaders/lib/selectionEncoding.wesl` — WESL source of truth: 4 constants + `packSelection`.
- `tests/data/selectionEncoding.test.ts` — TS round-trip + sentinel + bounds tests, plus the TS↔WESL parity test.

**Modify:**
- `src/services/engine/frame/passes/pointSpritesPass.ts` (encode site)
- `src/services/gpu/renderers/pickRenderer.ts` (sentinel write site + decode site)
- `src/services/gpu/shaders/points/vertex.wesl` (encode site)
- `src/services/gpu/shaders/points/pickFragment.wesl` (`+1` offset site)

The TS module lives under `src/data/` (rather than `src/services/gpu/`) because the encoding is a project-level data convention — `pointSpritesPass.ts` and `pickRenderer.ts` both consume it, and they sit in different subtrees. `src/data/` is where `sources.ts` already lives, which is the canonical home for "what surveys exist" — putting the selection encoding next to it pins both concepts together.

---

## Task 1: Define the TS selection-encoding module

**Files:**
- Create: `src/data/selectionEncoding.ts`
- Create: `tests/data/selectionEncoding.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// tests/data/selectionEncoding.test.ts
/**
 * Tests for the (sourceCode << 27) | localIdx packed-identity encoding.
 *
 * These cover round-trip correctness, the cleared-pick-texture sentinel
 * convention, and bounds (5-bit source, 27-bit localIdx). The TS↔WESL
 * parity test lives at the bottom and is added in a later task.
 */

import { describe, it, expect } from 'vitest';
import {
  SELECTION_SOURCE_SHIFT,
  SELECTION_LOCAL_IDX_MASK,
  SELECTION_NONE_SENTINEL,
  PICK_SENTINEL_OFFSET,
  packSelection,
  unpackPick,
} from '../../src/data/selectionEncoding';

describe('selectionEncoding', () => {
  it('exposes the canonical encoding constants', () => {
    expect(SELECTION_SOURCE_SHIFT).toBe(27);
    expect(SELECTION_LOCAL_IDX_MASK).toBe(0x07ffffff);
    expect(SELECTION_NONE_SENTINEL).toBe(0xffffffff);
    expect(PICK_SENTINEL_OFFSET).toBe(1);
  });

  it('packs (source, localIdx) into the documented bit layout', () => {
    // Source code 3 (e.g. SDSS) in bits 27..31, localIdx 42 in bits 0..26.
    // Expected: (3 << 27) | 42 = 0x18000000 | 0x2a = 0x1800002a.
    expect(packSelection(3, 42)).toBe(0x1800002a);
  });

  it('packs source code 0 + localIdx 0 to 0', () => {
    // The picker offsets writes by +1 specifically because this packed
    // value collides with the cleared-pick-texture sentinel. The encoding
    // itself does NOT do the offset — that's the picker's job.
    expect(packSelection(0, 0)).toBe(0);
  });

  it('unpacks a real pick value back to (source, localIdx)', () => {
    // Picker writes `packed + 1`. So a real hit of source=3, localIdx=42
    // arrives as 0x1800002b. unpackPick subtracts 1 from the bottom 27 bits.
    expect(unpackPick(0x1800002b)).toEqual({ source: 3, localIdx: 42 });
  });

  it('unpacks raw == 0 to null (cleared pick texture)', () => {
    expect(unpackPick(0)).toBeNull();
  });

  it('round-trips pack → +1 → unpackPick for a variety of identities', () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [0, 0x07fffffe],     // max localIdx that survives the +1 offset
      [1, 0],
      [31, 0],
      [31, 0x07fffffe],
    ];
    for (const [source, localIdx] of cases) {
      const packed = packSelection(source, localIdx);
      const rawPick = (packed + PICK_SENTINEL_OFFSET) >>> 0;
      expect(unpackPick(rawPick)).toEqual({ source, localIdx });
    }
  });

  it('sentinel does not collide with any allocated packed identity', () => {
    // Source codes 0..30 are allocated (5 bits, 32 slots, top slot 31
    // intentionally unallocated). Packing the largest allocated source
    // with the largest localIdx must remain < SELECTION_NONE_SENTINEL.
    const largestAllocated = packSelection(30, SELECTION_LOCAL_IDX_MASK);
    expect(largestAllocated).toBeLessThan(SELECTION_NONE_SENTINEL);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/data/selectionEncoding.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/data/selectionEncoding"`

- [ ] **Step 3: Create the TS module**

```ts
// src/data/selectionEncoding.ts
/**
 * selectionEncoding — single source of truth for the
 * `(sourceCode << 27) | localIdx` packed-identity encoding.
 *
 * ### Why this module exists
 *
 * skymap encodes a per-galaxy identity into one 32-bit unsigned integer
 * so the GPU pick texture (r32uint) can carry it as a single fragment
 * write. The encoding's magic numbers (the 27-bit shift, the 0x07ffffff
 * localIdx mask, the 0xFFFFFFFF "no selection" sentinel, the +1 pick
 * offset) used to be open-coded across three TS files and two WESL
 * files. That left no compile-time or test-time guard against drift
 * between the two languages — bump the shift on the TS side, forget
 * the matching WESL change, and the symptom is "the wrong galaxy
 * highlights when you click".
 *
 * This module exports the canonical TS values plus encode/decode
 * helpers. A sister `selectionEncoding.wesl` mirrors the same constants
 * for the shader side; the parity test in
 * `tests/data/selectionEncoding.test.ts` asserts the two stay in
 * lockstep.
 *
 * ### The encoding
 *
 *   bits 27..31  →  sourceCode      (5 bits, 0..31 — source code 31 is
 *                                   intentionally unallocated to keep
 *                                   the all-ones sentinel disjoint)
 *   bits  0..26  →  localIdx        (27 bits, 0..134M per source)
 *
 * The pick fragment writes `packed + PICK_SENTINEL_OFFSET` rather than
 * `packed` directly, so the cleared-to-zero pick texture remains
 * distinguishable from a legitimate (source=0, localIdx=0) hit. The
 * decode in `unpackPick` reverses the offset.
 */

/** Bit shift for the source code in the packed identity. */
export const SELECTION_SOURCE_SHIFT = 27;

/** Mask for the localIdx bits (the bottom 27 bits). */
export const SELECTION_LOCAL_IDX_MASK = 0x07ffffff;

/**
 * "Nothing selected" sentinel written into `u.selectedPacked` when no
 * galaxy is selected. Chosen as the max u32 because top-5-bits-set
 * encodes source code 31, which we don't allocate.
 */
export const SELECTION_NONE_SENTINEL = 0xffffffff;

/**
 * Offset added by the pick fragment before writing into the r32uint
 * texture, so the cleared-to-zero background pixel is unambiguously
 * "no hit" even when a real (source=0, localIdx=0) hit would otherwise
 * pack to zero. `unpackPick` subtracts this before returning the
 * decoded local index.
 */
export const PICK_SENTINEL_OFFSET = 1;

/**
 * Pack a `(sourceCode, localIdx)` pair into the canonical u32 layout.
 *
 * `>>> 0` is the standard JS trick to force the result back into the
 * u32 range — without it, the bitwise OR returns a signed i32, which
 * then sign-extends if you try to read it as u32 elsewhere.
 */
export function packSelection(sourceCode: number, localIdx: number): number {
  return ((sourceCode << SELECTION_SOURCE_SHIFT) | localIdx) >>> 0;
}

/**
 * Decode a raw value sampled from the pick texture into either a real
 * `(source, localIdx)` hit or `null` for the cleared-background case.
 *
 * Callers pass the unmodified texel value (still including the
 * `+ PICK_SENTINEL_OFFSET`); this function reverses both the offset
 * and the shift/mask layout.
 */
export function unpackPick(rawPickValue: number): { source: number; localIdx: number } | null {
  if (rawPickValue === 0) return null;
  const source = rawPickValue >>> SELECTION_SOURCE_SHIFT;
  const localIdx = (rawPickValue & SELECTION_LOCAL_IDX_MASK) - PICK_SENTINEL_OFFSET;
  return { source, localIdx };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/data/selectionEncoding.test.ts`
Expected: PASS — 7 passing

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: 1108 passing (1101 baseline + 7 new), 0 failing

- [ ] **Step 6: Commit**

```bash
git add src/data/selectionEncoding.ts tests/data/selectionEncoding.test.ts
git commit -m "$(cat <<'EOF'
feat(data): selectionEncoding module — constants + helpers

Single source of truth for the (sourceCode << 27) | localIdx packed
identity used by selection and picking. Replaces the open-coded magic
numbers scattered across pickRenderer.ts, pointSpritesPass.ts, and
several .wesl shaders. Migration of the consumers and the WESL
counterpart land in following commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create the WESL counterpart module

**Files:**
- Create: `src/services/gpu/shaders/lib/selectionEncoding.wesl`

This task adds the WESL module but does NOT yet wire the parity test or migrate consumers. The parity test arrives in Task 3 to keep failures specific to one change at a time.

- [ ] **Step 1: Create the WESL module**

```wesl
// lib/selectionEncoding.wesl — packed-identity encoding for selection / picking.
//
// ### Why this module exists
//
// Sister to 'src/data/selectionEncoding.ts'. The TS module is the
// authoritative source of truth; this file mirrors its constants and
// the 'packSelection' function so the shader side has a single
// importable home for the encoding instead of duplicating magic
// numbers inline.
//
// A parity test in 'tests/data/selectionEncoding.test.ts' reads this
// file as text, regex-extracts each 'const NAME: u32 = VALUE;' line,
// and asserts numerical equality with the TS export of the same name.
// Any future change to one side that doesn't match the other fails CI.
//
// ### Layout reminder
//
//   bits 27..31  →  sourceCode (5 bits, 0..31; 31 unallocated)
//   bits  0..26  →  localIdx   (27 bits, ≤ 134M)
//
// See the TS module's docstring for the full rationale.

/** Bit shift for the source code in the packed identity. */
const SELECTION_SOURCE_SHIFT: u32 = 27u;

/** Mask for the localIdx bits (the bottom 27 bits). */
const SELECTION_LOCAL_IDX_MASK: u32 = 0x07ffffffu;

/** 'Nothing selected' sentinel — top 5 bits set, encoding unallocated source 31. */
const SELECTION_NONE_SENTINEL: u32 = 0xffffffffu;

/** Offset the pick fragment adds before writing into the r32uint texture. */
const PICK_SENTINEL_OFFSET: u32 = 1u;

/** Pack a (sourceCode, localIdx) pair into the canonical u32 layout. */
fn packSelection(sourceCode: u32, localIdx: u32) -> u32 {
  return (sourceCode << SELECTION_SOURCE_SHIFT) | localIdx;
}
```

- [ ] **Step 2: Run typecheck + build to confirm the WESL file is well-formed**

Run: `npm run typecheck`
Expected: PASS — TS still typechecks (the WESL file isn't imported anywhere yet, but the build pipeline scans `src/` for shader assets).

Then run: `npm run build`
Expected: PASS — Vite + tsc complete cleanly, no shader errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/lib/selectionEncoding.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): selectionEncoding.wesl — packed-identity constants

WESL counterpart to src/data/selectionEncoding.ts. Mirrors the four
constants and the packSelection fn so shader modules can import a
single source of truth instead of inlining the (sourceCode << 27) |
localIdx encoding. Parity test enforcing TS↔WESL agreement arrives
in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the TS↔WESL parity test

**Files:**
- Modify: `tests/data/selectionEncoding.test.ts` (append the parity test)

- [ ] **Step 1: Append the parity test to the existing test file**

Add this block to the end of `tests/data/selectionEncoding.test.ts`, **after** the closing `});` of the existing `describe('selectionEncoding', ...)`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('selectionEncoding TS↔WESL parity', () => {
  /**
   * Reads the WESL file as text, extracts each
   * `const NAME: u32 = VALUE;` declaration via regex, parses the
   * value (decimal or hex literal, optional 'u' suffix), and returns
   * a `Map<NAME, parsedNumber>`. Throws if a constant we expect to
   * find is missing — the test will then fail with a clear message
   * instead of silently asserting `undefined === expected`.
   */
  function parseWeslConstants(): Map<string, number> {
    const path = resolve(
      __dirname,
      '../../src/services/gpu/shaders/lib/selectionEncoding.wesl',
    );
    const text = readFileSync(path, 'utf-8');

    // Match e.g.  const SELECTION_SOURCE_SHIFT: u32 = 27u;
    //   const FOO: u32 = 0x1234u;
    //   const FOO: u32 = 42;
    const re = /const\s+(\w+)\s*:\s*u32\s*=\s*(0x[0-9a-fA-F]+|\d+)u?\s*;/g;
    const map = new Map<string, number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1]!;
      const literal = m[2]!;
      const value = literal.startsWith('0x')
        ? parseInt(literal, 16)
        : parseInt(literal, 10);
      map.set(name, value);
    }
    return map;
  }

  it('each TS constant matches the WESL declaration of the same name', () => {
    const wesl = parseWeslConstants();

    // Use a table so a failure on any one constant reports both the
    // name and the mismatch — easier to debug than a bare equality
    // failure on a Map.
    const cases: Array<[string, number]> = [
      ['SELECTION_SOURCE_SHIFT', SELECTION_SOURCE_SHIFT],
      ['SELECTION_LOCAL_IDX_MASK', SELECTION_LOCAL_IDX_MASK],
      ['SELECTION_NONE_SENTINEL', SELECTION_NONE_SENTINEL],
      ['PICK_SENTINEL_OFFSET', PICK_SENTINEL_OFFSET],
    ];

    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from selectionEncoding.wesl`).toBeDefined();
      expect(
        weslValue,
        `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`,
      ).toBe(tsValue);
    }
  });
});
```

- [ ] **Step 2: Run the parity test to confirm it passes**

Run: `npx vitest run tests/data/selectionEncoding.test.ts`
Expected: PASS — 8 passing (7 original + 1 parity).

- [ ] **Step 3: Run the parity test against an intentionally-broken WESL file to confirm it fails loudly**

Temporarily edit `src/services/gpu/shaders/lib/selectionEncoding.wesl` and change `SELECTION_SOURCE_SHIFT: u32 = 27u;` to `28u;`.

Run: `npx vitest run tests/data/selectionEncoding.test.ts`
Expected: FAIL with message like `WESL SELECTION_SOURCE_SHIFT (28) does not match TS SELECTION_SOURCE_SHIFT (27)`.

Revert the WESL file to `27u;`.

Re-run: `npx vitest run tests/data/selectionEncoding.test.ts`
Expected: PASS — 8 passing.

- [ ] **Step 4: Commit**

```bash
git add tests/data/selectionEncoding.test.ts
git commit -m "$(cat <<'EOF'
test(data): TS↔WESL parity test for selectionEncoding

Read the WESL file as text, regex-extract each const declaration,
and assert numerical equality with the TS export of the same name.
Any future change to one side that doesn't match the other now
fails CI with a clear name+value mismatch message.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `pointSpritesPass.ts` to use `packSelection`

**Files:**
- Modify: `src/services/engine/frame/passes/pointSpritesPass.ts:67-70`

- [ ] **Step 1: Read the current site**

Open `src/services/engine/frame/passes/pointSpritesPass.ts` and locate lines 67-70. The current code is:

```ts
    const selectedPacked =
      settings.selected !== null
        ? ((settings.selected.source << 27) | settings.selected.localIdx) >>> 0
        : 0xffffffff >>> 0;
```

- [ ] **Step 2: Add the import**

At the top of the file, near the existing imports (look for the block around line 49 `import type { Pass } from './types';`), add:

```ts
import {
  packSelection,
  SELECTION_NONE_SENTINEL,
} from '../../../../data/selectionEncoding';
```

(Path is relative from `src/services/engine/frame/passes/` → up four levels to `src/`, then `data/selectionEncoding`.)

- [ ] **Step 3: Replace the inline encode**

Change lines 67-70 to:

```ts
    const selectedPacked =
      settings.selected !== null
        ? packSelection(settings.selected.source, settings.selected.localIdx)
        : SELECTION_NONE_SENTINEL;
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: 1108 passing (no regressions — the encoding is identical, only the indirection changed).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/frame/passes/pointSpritesPass.ts
git commit -m "$(cat <<'EOF'
refactor(passes): pointSpritesPass uses selectionEncoding helpers

Replace the inline `(source << 27) | localIdx` encode and the
0xffffffff sentinel with packSelection / SELECTION_NONE_SENTINEL
from src/data/selectionEncoding. Behaviour identical; one fewer
place that encodes the magic shift width.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate `pickRenderer.ts` to use `SELECTION_NONE_SENTINEL` + `unpackPick`

**Files:**
- Modify: `src/services/gpu/renderers/pickRenderer.ts:513` (sentinel write)
- Modify: `src/services/gpu/renderers/pickRenderer.ts:669-672` (decode)

Two distinct sites; one commit covers both since they're in the same file and same logical change.

- [ ] **Step 1: Add the import**

Near the top of `src/services/gpu/renderers/pickRenderer.ts`, with the existing imports, add:

```ts
import {
  SELECTION_NONE_SENTINEL,
  unpackPick,
} from '../../../data/selectionEncoding';
```

(Path is relative from `src/services/gpu/renderers/` → up three levels → `data/selectionEncoding`.)

- [ ] **Step 2: Replace the sentinel write at line ~513**

Locate the block at line 513:

```ts
    const SELECTED_PACKED_OFFSET = 80;
    const NONE_SENTINEL = new Uint32Array([0xffffffff]);
    device.queue.writeBuffer(sharedUniformBuffer, SELECTED_PACKED_OFFSET, NONE_SENTINEL);
```

Replace it with:

```ts
    const SELECTED_PACKED_OFFSET = 80;
    const noneSentinel = new Uint32Array([SELECTION_NONE_SENTINEL]);
    device.queue.writeBuffer(sharedUniformBuffer, SELECTED_PACKED_OFFSET, noneSentinel);
```

(Keep `SELECTED_PACKED_OFFSET` local — it's a layout constant tied to the shared uniform buffer's CameraUniforms prefix, not part of the selection encoding.)

- [ ] **Step 3: Replace the decode at line ~669-672**

Locate the block at lines 669-672:

```ts
      if (raw === 0) return null;
      const source = (raw >>> 27) as Source;
      const localIdx = (raw & 0x07ffffff) - 1;
      return { source, localIdx };
```

Replace it with:

```ts
      const decoded = unpackPick(raw);
      if (decoded === null) return null;
      return { source: decoded.source as Source, localIdx: decoded.localIdx };
```

(`unpackPick` returns `{ source: number; localIdx: number }`; we narrow `source` back to the `Source` enum at this call site since the consumer expects the branded type.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: 1108 passing.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/renderers/pickRenderer.ts
git commit -m "$(cat <<'EOF'
refactor(renderers): pickRenderer uses selectionEncoding helpers

Replace the inline 0xffffffff sentinel write and the open-coded
(raw >>> 27) / (raw & 0x07ffffff) - 1 decode with
SELECTION_NONE_SENTINEL and unpackPick. Behaviour identical; the
shift/mask/sentinel/+1 are now consumed from src/data/selectionEncoding
instead of being inlined.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `vertex.wesl` to import `packSelection`

**Files:**
- Modify: `src/services/gpu/shaders/points/vertex.wesl`

- [ ] **Step 1: Add the WESL import**

Open `src/services/gpu/shaders/points/vertex.wesl` and locate the import block (around lines 30-38, near `import package::points::io::Uniforms;`). Add at the bottom of the block:

```wesl
import package::lib::selectionEncoding::packSelection;
```

- [ ] **Step 2: Replace the inline packing at line ~98**

Locate the line:

```wesl
  let myPacked = (cloud.sourceCode << 27u) | ii;
```

Replace with:

```wesl
  let myPacked = packSelection(cloud.sourceCode, ii);
```

- [ ] **Step 3: Build to confirm shaders compile**

Run: `npm run build`
Expected: PASS — Vite completes, no WESL errors. The build's WESL preprocessor resolves the `package::lib::selectionEncoding::packSelection` import.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: 1108 passing.

- [ ] **Step 5: Visual smoke test (manual)**

The dev server should already be running (`npm run dev`). Open the app in a browser, hover over and click a galaxy. Verify:
- Hover halo appears on the correct galaxy under the cursor.
- Clicking selects a galaxy; the selection ring renders around the clicked galaxy, not the wrong one.
- The InfoCard shows data from the same galaxy that's visually highlighted.

If any of these fail, the WESL import path or the function call is wrong — revert the WESL edit and double-check the import syntax against existing imports in the file.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/points/vertex.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): vertex.wesl uses packSelection

Import packSelection from lib/selectionEncoding instead of inlining
the (sourceCode << 27u) | ii expression. The shift width and the
encoding shape are now consumed from one cross-language source of
truth — bumping localIdx to 28 bits in future only requires editing
the TS + WESL encoding modules, with the parity test as the safety net.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrate `pickFragment.wesl` to use `PICK_SENTINEL_OFFSET`

**Files:**
- Modify: `src/services/gpu/shaders/points/pickFragment.wesl`

- [ ] **Step 1: Add the WESL import**

Open `src/services/gpu/shaders/points/pickFragment.wesl` and locate the import line (around line 34, `import package::points::io::VSOut;`). Add immediately below:

```wesl
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;
```

- [ ] **Step 2: Replace the `+1u` magic offset**

Locate the return at the bottom of `fsPick`:

```wesl
  return vec4<u32>(in.instanceIdx + 1u, 0u, 0u, 0u);
```

Replace with:

```wesl
  return vec4<u32>(in.instanceIdx + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);
```

- [ ] **Step 3: Build to confirm shaders compile**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: 1108 passing.

- [ ] **Step 5: Visual smoke test (manual)**

In the browser, click a galaxy and verify the InfoCard shows that galaxy's data. The pick texture write is the critical step in the click pipeline — if the offset is wrong, every pick would either return null (no offset) or shift the decoded localIdx by some other amount.

Also verify that clicking on empty space (background) deselects (returns null from the pick read).

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/points/pickFragment.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): pickFragment.wesl uses PICK_SENTINEL_OFFSET

Replace the inline +1u with the imported constant from
lib/selectionEncoding. Completes the migration of all production
selection-encoding sites in TS and WESL to the shared module.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification and push

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite one more time**

Run: `npm test`
Expected: 1108 passing.

- [ ] **Step 2: Run typecheck (both src and tools)**

Run: `npm run typecheck`
Expected: PASS for both `tsconfig.json` and `tsconfig.tools.json`.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Comprehensive manual visual check**

In the browser (dev server running):

1. **Hover across all three surveys.** Pan/zoom to a region where SDSS, 2MRS, and GLADE galaxies overlap. Hover over individual points from each survey. Verify the hover halo appears under the cursor and the InfoCard updates to show data for the correct survey.

2. **Click to select.** Click a galaxy from each survey. Verify:
   - The clicked galaxy gets the 8× selection ring.
   - The InfoCard shows that exact galaxy's data.
   - Clicking elsewhere selects the new galaxy and unselects the old one.

3. **Click empty space.** Verify the selection ring disappears and the InfoCard clears.

4. **Toggle source visibility.** Use the source visibility toggles in the settings panel. Verify selection survives a visibility toggle and that picking still works against visible sources only.

If any visual behavior changes vs. pre-refactor, revert and investigate — the encoding sites should be byte-identical at the GPU level.

- [ ] **Step 5: Verify git log**

Run: `git log --oneline main..HEAD`
Expected: 7 commits, all on `refactor/selection-encoding-module`:

```
<sha7>  refactor(shaders): pickFragment.wesl uses PICK_SENTINEL_OFFSET
<sha6>  refactor(shaders): vertex.wesl uses packSelection
<sha5>  refactor(renderers): pickRenderer uses selectionEncoding helpers
<sha4>  refactor(passes): pointSpritesPass uses selectionEncoding helpers
<sha3>  test(data): TS↔WESL parity test for selectionEncoding
<sha2>  feat(shaders): selectionEncoding.wesl — packed-identity constants
<sha1>  feat(data): selectionEncoding module — constants + helpers
```

- [ ] **Step 6: Push the branch**

Run: `git push -u origin refactor/selection-encoding-module`
Expected: branch pushed; gh prints a "Create a pull request" URL.

- [ ] **Step 7: Open the PR**

Run:

```bash
gh pr create --title "refactor: centralise selection-encoding in TS + WESL" --body "$(cat <<'EOF'
## Summary

Addresses audit finding #3 from the second architectural audit
(2026-05-11): the `(sourceCode << 27) | localIdx` packed-identity
encoding was open-coded across 3 TS files and 2 WESL files with no
shared symbol. This PR introduces a single TS module and a sister
WESL module, with a parity test that catches future drift between
the two languages.

### Files added
- `src/data/selectionEncoding.ts` — TS constants + `packSelection` + `unpackPick`
- `src/services/gpu/shaders/lib/selectionEncoding.wesl` — WESL constants + `packSelection`
- `tests/data/selectionEncoding.test.ts` — round-trip + sentinel + bounds tests + TS↔WESL parity test

### Migration
- `pointSpritesPass.ts` — encode site
- `pickRenderer.ts` — sentinel write + decode
- `vertex.wesl` — encode site
- `pickFragment.wesl` — `+1u` → `PICK_SENTINEL_OFFSET`

### Why this matters

Before: bumping the shift width or sentinel on one side without the
other was a silent failure. After: the parity test fails CI with a
clear name+value mismatch message.

## Test plan

- [x] `npm test` — 1108 passing (1101 baseline + 7 new)
- [x] `npm run typecheck` — clean
- [x] `npm run build` — clean
- [x] Hover + select work across SDSS, 2MRS, GLADE in the browser
- [x] Background click deselects
- [x] Source visibility toggles don't break selection

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: gh prints the PR URL.

---

## Self-Review Notes

**Spec coverage:**
- Audit finding #3 listed: encoding, mask, sentinel, +1 offset across 9+ files. Plan covers: 3 TS production sites + 2 WESL production sites (the remaining hits are docstrings, which don't need migration but will lose the `// see N.wesl:N` literal references — left untouched for blame-history readability).
- Parity test: covered in Task 3.
- WESL constants module: covered in Task 2.

**Placeholder scan:** None found — every step has concrete code, exact file paths with line numbers, and an explicit expected pass/fail outcome.

**Type consistency:** `packSelection` signature `(sourceCode: number, localIdx: number) → number` consistent across Task 1, Task 4, Task 6. `unpackPick` returns `{ source: number; localIdx: number } | null` in Task 1 and the migration narrows at the call site in Task 5. WESL `packSelection(sourceCode: u32, localIdx: u32) -> u32` consistent across Task 2 and Task 6.

**Known scope omissions (intentional):**
- The `+ 1` offset in `pickRenderer.ts` decode (`(raw & 0x07ffffff) - 1`) is folded into `unpackPick` via `PICK_SENTINEL_OFFSET`. No separate task needed.
- The docstring `// see (sourceCode << 27) | ...` comments scattered across the codebase are not touched — they serve as locator hints and removing them would obscure history. If they go stale, they can be updated incidentally in a future PR.
- The `buildPointInterleavedBuffer.ts:89` docstring reference is informational; no production code change needed.
- The `clickHandler.ts:80` docstring reference is similarly informational; no code change.
