# Famous-galaxy square-preserving deproject crop — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Plan-style: **contract code yes, implementation code no** — give exact signatures + full test code, write no implementation bodies (`docs/superpowers/conventions/plan-style.md`).

**Goal:** When a famous-galaxy disk is deprojected, ship a **square** thumbnail. Today deprojection affine-stretches a square crop's minor axis, sharp auto-grows the canvas to a rectangle, and `fit: 'inside'` preserves that aspect → non-square output. Fix: in deproject mode the curator crop becomes a **PA-locked, aspect-locked (b/a), freely-movable rectangle** whose minor-axis stretch lands it on an exact square. As-shot (deproject OFF) mode is unchanged.

**Architecture:** Two crop modes gated by `disk.deproject`. As-shot keeps today's free 1:1 square crop. Deproject locks `crop.rotationDeg = disk.paDeg` and `crop.height = crop.width · effectiveAxisRatio`, so `effectivePaDeg` reduces to 0 and `deprojectDisk` runs as a pure image-Y stretch that produces an exact square (`width × (width·(b/a)·(1/(b/a)))`). A new shared pure helper `squareDeprojectCrop` normalises the client crop server-side as defence-in-depth. New parallel aspect-locked `cropMath` helpers keep the square path untouched. `deriveFamousCalibration` gains a deprojected branch (PA→0, axisRatio→1, off-centre-aware center/radius).

**Tech Stack:** TS (tools/), React + useReducer (curator UI), sharp (pipeline), vitest (+ jsdom for component tests). `type` aliases never `interface`; `Vec2`/`Vec3` from `src/@types/math`; deep relative imports, no barrels; one-type-per-file ONLY under `src/@types/`.

**Depends on:** the merged calibration work (`RecipeDisk`, `DEPROJECT_MIN_AXIS_RATIO`, `deprojectDisk`/`willDeproject`, `deriveFamousCalibration`, curator disk overlay). This plan extends those — read them before each task.

**Spec:** `docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md` → "## Addendum (2026-06-01): square-preserving deproject crop".

---

## Conventions every task must follow (HARD)

- **Run bash SEQUENTIALLY** — never batch independent bash calls; a single permission denial cancels the whole batch. One bash call, wait, next.
- **Never `sed` / `awk` / `grep` via bash** — use the Read tool + the Grep tool.
- **Never `git add -A` / `git add .`** — stage the exact paths listed in the task.
- **Typecheck without piping:** `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` then Read `/tmp/tc.log` and check `rc`. Do NOT `| tail`.
- **Tests:** `npm test -- <pattern> > /tmp/t.log 2>&1; rc=$?` then Read the log.
- **Commit with the user's git identity** (never `--author=Claude...`); message body ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Tick this plan's checkboxes inline** as each step completes (flip `- [ ]` → `- [x]` in the same response that finishes the step).
- **Comment-tidy** every file you touch: didactic, timeless, terse — WHY not history; no dates/PR refs/"pre-X" notes.
- `type` aliases never `interface`; `Vec2` from `src/@types/math/Vec2` never raw `[number, number]`.
- Curator UI **component** tests live under `tests/tools/famous-curator/ui/components/`; UI **pure-helper/reducer** tests under `tests/tools/famous-curator/ui/` (`cropMath.test.ts`, `state.test.ts`, `diskOverlay.test.ts`). All component tests carry a `// @vitest-environment jsdom` directive (the React setup already stubs `ResizeObserver` + `getBoundingClientRect`). **Curator plugin/route** tests live under `tests/tools/famous-curator/` (root: `recipe.test.ts`) and `tests/tools/famous-curator/routes/` (`export.test.ts`). **Famous-tool** pure helpers (`deprojectDisk`, `deriveFamousCalibration`, `buildFamous`) are tested under `tests/tools/famous/` — extend `deriveFamousCalibration.test.ts` there, NOT under `famous-curator/`. New `squareDeprojectCrop.ts` lives in `tools/famous/` but its test goes at `tests/tools/famous-curator/` root for proximity to the route tests that consume it (either dir is picked up by the `tests/**` vitest include; this is the only judgement call — root `famous-curator/` keeps it next to `recipe.test.ts`).

---

## File-structure map

**Created**
- `tools/famous/squareDeprojectCrop.ts` — pure crop-normaliser shared by both routes.
- `tests/tools/famous-curator/squareDeprojectCrop.test.ts` — its unit tests.

**Modified**
- `src/data/famousCalibration.ts` — add `DEFAULT_DISK_MARGIN`.
- `tools/famous-curator/ui/cropMath.ts` — add aspect-locked resize helpers + `seedDeprojectCrop`.
- `tests/tools/famous-curator/cropMath.test.ts` — aspect-helper tests.
- `tools/famous-curator/plugin/recipe.ts` — optional `margin?: number` on `RecipeDisk` (validate/parse/serialise).
- `tests/tools/famous-curator/recipe.test.ts` — margin round-trip.
- `tools/famous-curator/plugin/routes/export.ts` — call `squareDeprojectCrop` when deprojected.
- `tools/famous-curator/plugin/routes/process.ts` — same.
- `tests/tools/famous-curator/routes/export.test.ts` — square-output assertion (+ as-shot regression).
- `tools/famous/deriveFamousCalibration.ts` — deprojected branch (PA→0, axisRatio→1, off-centre center/radius).
- `tests/tools/famous/deriveFamousCalibration.test.ts` — deprojected-branch tests.
- `tools/famous-curator/ui/components/CropCanvas.tsx` — `deprojectAspect` prop; rotation/aspect lock.
- `tests/tools/famous-curator/ui/CropCanvas.test.tsx` — rotate-handle-absent + aspect-on-resize.
- `tools/famous-curator/ui/components/DiskOverlay.tsx` — live crop-preview rect + mask.
- `tests/tools/famous-curator/ui/DiskOverlay.test.tsx` — preview-rect presence gated on deproject (create).
- `tools/famous-curator/ui/components/DiskControls.tsx` — margin slider.
- `tests/tools/famous-curator/ui/DiskControls.test.tsx` — slider gating + dispatch (create).
- `tools/famous-curator/ui/state.ts` — `margin` threading + non-destructive square-crop store/restore on toggle.
- `tests/tools/famous-curator/ui/state.test.ts` — toggle coupling.
- `tools/famous-curator/ui/App.tsx` — seed/normalise crop on deproject toggle; thread `deprojectAspect`.

---

## Task 1: `DEFAULT_DISK_MARGIN` constant

**Files:**
- Modify: `src/data/famousCalibration.ts`
- Test: `tests/tools/famous-curator/squareDeprojectCrop.test.ts` consumes it (covered there; no standalone test needed for a bare constant).

**Contract:**

```ts
// src/data/famousCalibration.ts — next to DEPROJECT_MIN_AXIS_RATIO
export const DEFAULT_DISK_MARGIN = 0.25;
```

**Behaviour:** the default fractional padding around a disk when seeding the deproject crop — `width = 2·radiusPx·(1 + DEFAULT_DISK_MARGIN)`. Single source of truth for curator-seed, pipeline, and UI.

- [x] Add the constant with a didactic docblock (WHY 0.25: leaves a quarter-radius of sky around the disk so the deprojected square isn't cropped tight to the edge; tunable against real images).
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → Read log, `rc == 0`.
- [x] Comment-tidy the file (it's tiny — confirm both constants read cleanly).
- [x] Commit `src/data/famousCalibration.ts`.

---

## Task 2: `squareDeprojectCrop` pure helper

**Files:**
- Create: `tools/famous/squareDeprojectCrop.ts`
- Create: `tests/tools/famous-curator/squareDeprojectCrop.test.ts` (root of `famous-curator/` tests, alongside `recipe.test.ts`)

**Contract:**

```ts
// tools/famous/squareDeprojectCrop.ts
import type { RotatedCrop } from '../famous-curator/plugin/cropExtract';
import type { RecipeDisk } from '../famous-curator/plugin/recipe';

/**
 * Normalise a crop so the subsequent deproject stretch produces an exact
 * square: snaps rotationDeg = disk.paDeg and height = round(width · effectiveAxisRatio),
 * preserving the crop's CENTRE (re-derives x/y from centre so the snap never
 * drifts the framing).  Pure.  Callers invoke this ONLY when deprojected.
 */
export function squareDeprojectCrop(
  crop: RotatedCrop,
  disk: RecipeDisk,
  effectiveAxisRatio: number,
): RotatedCrop;
```

**Behaviour / reduction reasoning (pin in the file header):** with `rotationDeg = disk.paDeg` and `height = width·(b/a)`, `rotatedExtract` returns a rect in the crop frame where the disk minor axis is image-Y; `effectivePaDeg = disk.paDeg - rotationDeg = 0`, so `deprojectDisk` is `M=[[1,0],[0,1/(b/a)]]` → output `width × (width·(b/a)·(1/(b/a))) = width × width`. Centre preservation: compute `cx = crop.x + crop.width/2`, `cy = crop.y + crop.height/2`; new `x = cx - width/2`, `y = cy - newHeight/2`.

**Full test code:**

```ts
// tests/tools/famous-curator/squareDeprojectCrop.test.ts
import { describe, it, expect } from 'vitest';
import { squareDeprojectCrop } from '../../../tools/famous/squareDeprojectCrop';
import type { RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';

const disk = (over: Partial<RecipeDisk> = {}): RecipeDisk => ({
  centerPx: [100, 100],
  radiusPx: 40,
  paDeg: 30,
  axisRatio: 0.5,
  deproject: true,
  ...over,
});

describe('squareDeprojectCrop', () => {
  it('snaps rotationDeg to disk.paDeg', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 0 },
      disk({ paDeg: 30 }),
      0.5,
    );
    expect(out.rotationDeg).toBe(30);
  });

  it('snaps height to round(width * effectiveAxisRatio)', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 0 },
      disk(),
      0.5,
    );
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
  });

  it('preserves the crop centre', () => {
    const inCrop = { x: 50, y: 60, width: 200, height: 200, rotationDeg: 0 };
    const out = squareDeprojectCrop(inCrop, disk(), 0.5);
    const cx = inCrop.x + inCrop.width / 2;
    const cy = inCrop.y + inCrop.height / 2;
    expect(out.x + out.width / 2).toBeCloseTo(cx, 6);
    expect(out.y + out.height / 2).toBeCloseTo(cy, 6);
  });

  it('is identity-on-aspect at b/a = 1 (height == width, square stays square)', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 45 },
      disk({ axisRatio: 1, paDeg: 90 }),
      1,
    );
    expect(out.width).toBe(out.height);
    expect(out.rotationDeg).toBe(90);
  });

  it('the post-deproject extent is square (width === height * (1/aspect) ⇒ width === square side)', () => {
    // height = width*aspect; minor-axis stretch by 1/aspect ⇒ stretched height = width.
    const aspect = 0.4;
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 300, height: 300, rotationDeg: 0 },
      disk({ axisRatio: aspect }),
      aspect,
    );
    expect(out.height * (1 / aspect)).toBeCloseTo(out.width, 6);
  });
});
```

- [x] Write the test file above; `npm test -- squareDeprojectCrop > /tmp/t.log 2>&1; rc=$?` → FAIL (module missing).
- [x] Implement `squareDeprojectCrop` (header with the reduction reasoning; no rounding of x/y beyond what RotatedCrop callers tolerate — `rotatedExtract` does its own `Math.round`).
- [x] `npm test -- squareDeprojectCrop > /tmp/t.log 2>&1; rc=$?` → PASS.
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous/squareDeprojectCrop.ts tests/tools/famous-curator/squareDeprojectCrop.test.ts`.

---

## Task 3: aspect-locked `cropMath` helpers + `seedDeprojectCrop`

**Files:**
- Modify: `tools/famous-curator/ui/cropMath.ts`
- Test: `tests/tools/famous-curator/cropMath.test.ts` (existing — extend)

**Recommended approach: NEW parallel functions, NOT parameterised `squareDelta`/`edgeResult`.** Justification: the square path is load-bearing for as-shot mode and has corner/edge sign logic per handle (`cropMath.ts:101-189`); threading an `aspect` default through `squareDelta` + `edgeResult` + all eight call sites risks a silent behavioural drift in the untouched as-shot path. A separate family keeps the square path byte-for-byte and makes the deproject path independently testable.

**Contract:**

```ts
// All in source px. aspect = height/width (= b/a). rotationDeg is carried through
// unchanged (App locks it to disk.paDeg; these helpers do not set it).

/** Uniform-scale resize from a corner, preserving height = width*aspect. */
export function resizeCornerAspectSE(c: Crop, dx: number, dy: number, aspect: number, b: Bounds): Crop;
export function resizeCornerAspectNW(c: Crop, dx: number, dy: number, aspect: number, b: Bounds): Crop;
export function resizeCornerAspectNE(c: Crop, dx: number, dy: number, aspect: number, b: Bounds): Crop;
export function resizeCornerAspectSW(c: Crop, dx: number, dy: number, aspect: number, b: Bounds): Crop;

/** Edge resize: dragged edge sets new width (E/W) or height (N/S); the other axis
 *  follows from aspect; rect recentred on the perpendicular mid-axis (mirrors edgeResult). */
export function resizeEdgeAspectE(c: Crop, dx: number, aspect: number, b: Bounds): Crop;
export function resizeEdgeAspectW(c: Crop, dx: number, aspect: number, b: Bounds): Crop;
export function resizeEdgeAspectN(c: Crop, dy: number, aspect: number, b: Bounds): Crop;
export function resizeEdgeAspectS(c: Crop, dy: number, aspect: number, b: Bounds): Crop;

/** Seed a deproject crop framing a disk: width = 2·radiusPx·(1+margin),
 *  height = width·aspect, centred on centerPx, rotationDeg = paDeg. Centre clamped to bounds. */
export function seedDeprojectCrop(
  centerPx: Vec2,
  radiusPx: number,
  paDeg: number,
  aspect: number,
  margin: number,
  b: Bounds,
): Crop;
```

**Behaviour:** every aspect helper guarantees `height === Math.max(1, round(width·aspect))` (or width from height for N/S edges) on its output, and uses the same `clampCenter` invariant the square helpers use (centre stays in bounds, corners may exit). Reuse `clampCenter`; do not duplicate it.

**Full test code (extend the existing describe block in cropMath.test.ts):**

```ts
import {
  resizeCornerAspectSE,
  resizeEdgeAspectE,
  seedDeprojectCrop,
} from '../../../tools/famous-curator/ui/cropMath';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const B = { width: 1000, height: 1000 };

describe('cropMath aspect-locked helpers', () => {
  it('resizeCornerAspectSE keeps height = width * aspect', () => {
    const c = { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 };
    const out = resizeCornerAspectSE(c, 50, 50, 0.5, B);
    expect(out.height).toBeCloseTo(out.width * 0.5, 0);
    expect(out.rotationDeg).toBe(30); // rotation carried through, not modified
  });

  it('resizeEdgeAspectE grows width and recomputes height from aspect', () => {
    const c = { x: 100, y: 100, width: 200, height: 80, rotationDeg: 0 };
    const out = resizeEdgeAspectE(c, 100, 0.4, B);
    expect(out.width).toBeGreaterThan(200);
    expect(out.height).toBeCloseTo(out.width * 0.4, 0);
  });

  it('seedDeprojectCrop frames the disk at the requested margin', () => {
    const center: Vec2 = [500, 500];
    const out = seedDeprojectCrop(center, 40, 30, 0.5, 0.25, B);
    expect(out.width).toBeCloseTo(2 * 40 * 1.25, 6); // 100
    expect(out.height).toBeCloseTo(out.width * 0.5, 0); // 50
    expect(out.rotationDeg).toBe(30);
    expect(out.x + out.width / 2).toBeCloseTo(center[0], 6);
    expect(out.y + out.height / 2).toBeCloseTo(center[1], 6);
  });

  it('seedDeprojectCrop at aspect 1 is a square framing', () => {
    const out = seedDeprojectCrop([500, 500], 50, 0, 1, 0, B);
    expect(out.width).toBe(out.height);
  });
});
```

- [x] Add the imports + tests above; `npm test -- cropMath > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [x] Implement the helpers (reuse `clampCenter`; add a file-header paragraph documenting the aspect convention `aspect = height/width = b/a`).
- [x] `npm test -- cropMath > /tmp/t.log 2>&1; rc=$?` → PASS (new + all existing square tests still green).
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous-curator/ui/cropMath.ts tests/tools/famous-curator/cropMath.test.ts`.

---

## Task 4: `RecipeDisk.margin` field

**Files:**
- Modify: `tools/famous-curator/plugin/recipe.ts`
- Test: `tests/tools/famous-curator/recipe.test.ts` (existing — extend)

**Contract:** add to `RecipeDisk`:

```ts
/** Fractional sky padding around the disk for the deproject crop seed.
 *  Optional; absent ⇒ DEFAULT_DISK_MARGIN. Validated >= 0. */
margin?: number;
```

**Behaviour:** `validateRecipeDisk` accepts `margin` when present (finite, `>= 0`), throws on a negative or non-finite value, omits it from the returned object when absent (backward compatible — existing recipes without `margin` round-trip unchanged). `serialiseRecipe`/`parseRecipe` carry it through via the existing `validateRecipeDisk` delegation. Do NOT bump `version` (the field is optional).

**Full test code (extend recipe.test.ts):**

```ts
describe('RecipeDisk.margin', () => {
  it('round-trips a margin through serialise/parse', () => {
    const r = parseRecipe(serialiseRecipe({
      version: 1, id: 'm51',
      crop: { x: 0, y: 0, width: 10, height: 10, rotationDeg: 0 },
      starnet: { stride: 16, upsample: false },
      alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
      metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
      processedAt: '2026-06-01T00:00:00Z',
      disk: { centerPx: [1, 2], radiusPx: 3, paDeg: 4, deproject: true, margin: 0.5 },
    }));
    expect(r.disk?.margin).toBe(0.5);
  });

  it('omits margin when absent (backward compatible)', () => {
    const d = validateRecipeDisk({ centerPx: [1, 2], radiusPx: 3, paDeg: 4, deproject: false });
    expect('margin' in d).toBe(false);
  });

  it('throws on a negative margin', () => {
    expect(() =>
      validateRecipeDisk({ centerPx: [1, 2], radiusPx: 3, paDeg: 4, deproject: true, margin: -0.1 }),
    ).toThrow(/margin/);
  });
});
```

- [x] Add the tests (import `validateRecipeDisk`, `parseRecipe`, `serialiseRecipe` as the file already does); `npm test -- recipe > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [x] Add the field + validation (mirror the `axisRatio` optional-finite pattern at `recipe.ts:128-132`, plus a `>= 0` check) and the docblock on `RecipeDisk`.
- [x] `npm test -- recipe > /tmp/t.log 2>&1; rc=$?` → PASS.
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous-curator/plugin/recipe.ts tests/tools/famous-curator/recipe.test.ts`.

---

## Task 5: wire `squareDeprojectCrop` into export + process routes

**Files:**
- Modify: `tools/famous-curator/plugin/routes/export.ts`
- Modify: `tools/famous-curator/plugin/routes/process.ts`
- Test: `tests/tools/famous-curator/routes/export.test.ts` (existing — extend; sibling deproject tests already exist at `routes/process.deproject.test.ts` and root `export.deproject.test.ts` — read them for the established session/source fixture pattern)

**Behaviour:** in BOTH routes, when `deprojected === true`, normalise the crop through `squareDeprojectCrop(body.crop, disk, effectiveAxisRatio)` and feed the normalised crop to `rotatedExtract` (and to `deriveFamousCalibration` in export). When `deprojected === false`, the as-shot path is untouched (uses `body.crop` verbatim). The existing `effectivePaDeg`/`willDeproject`/`deprojectDisk` logic stays; with the normalised crop, `effectivePaDeg` becomes 0 so the stretch is the pure image-Y stretch that yields a square (see spec addendum). Keep `disk`/`effectiveAxisRatio`/`deprojected` derivation where it already is (`export.ts:119-129`, `process.ts:81-86`).

> **Pin for export.ts:** the normalised crop must flow to BOTH `rotatedExtract` (`export.ts:141`) AND `deriveFamousCalibration` (`export.ts:138`) so the runtime calibration matches the shipped pixels. The recipe (`export.ts:210`) still records the original `body.crop` (the curator's source-of-truth annotation) — only the *extraction* crop is normalised. Comment this distinction.

**Full test code (extend export.test.ts — follow the existing fixture/setup pattern in that file for `repoRoot`, session dir, and a tilted-disk source image):**

```ts
import sharp from 'sharp';

describe('deproject square output', () => {
  it('ships a square source.webp AND full.webp for a tilted disk', async () => {
    // Arrange a session with a non-square source and a tilted disk
    // (axisRatio 0.5, paDeg 30, deproject true). Reuse this file's existing
    // session-fixture helper; crop is an arbitrary square the UI might send.
    const res = await handleExport({
      body: {
        id: 'tilt', tmpId: /* fixture */ '',
        crop: { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        disk: { centerPx: [300, 300], radiusPx: 80, paDeg: 30, axisRatio: 0.5, deproject: true },
        catalogAxisRatio: 0.5,
      },
      repoRoot: /* fixture */ '',
      sessionDirOverride: /* fixture */ '',
    });
    const src = await sharp(res.paths.source).metadata();
    const full = await sharp(res.paths.full).metadata();
    expect(src.width).toBe(src.height);
    expect(full.width).toBe(full.height);
  });

  it('leaves as-shot (deproject off) output unchanged — square crop ⇒ square out', async () => {
    const res = await handleExport({
      body: {
        id: 'asshot', tmpId: /* fixture */ '',
        crop: { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 },
        starnet: { stride: 16, upsample: false },
        alpha: { blackPoint: 0, whitePoint: 1, gamma: 1 },
        metadata: { sourceUrl: 'u', license: 'l', author: 'a' },
        disk: { centerPx: [300, 300], radiusPx: 80, paDeg: 30, axisRatio: 0.5, deproject: false },
        catalogAxisRatio: 0.5,
      },
      repoRoot: /* fixture */ '',
      sessionDirOverride: /* fixture */ '',
    });
    const src = await sharp(res.paths.source).metadata();
    expect(src.width).toBe(src.height);
  });
});
```

> The `/* fixture */` placeholders: wire them to this file's existing setup (it already constructs a tmp session with `source.png` + `starless.png` and a `repoRoot`). The implementer fills these from the surrounding test scaffolding rather than inventing a new harness.

- [x] Add the tests; `npm test -- export > /tmp/t.log 2>&1; rc=$?` → the tilted-disk square assertion FAILS (rectangle today), as-shot passes.
- [x] Import `squareDeprojectCrop` in both routes; insert the normalisation (only in the `deprojected` branch) and feed the normalised crop to `rotatedExtract` (both routes) and `deriveFamousCalibration` (export). Comment-tidy the touched comment blocks.
- [x] `npm test -- export > /tmp/t.log 2>&1; rc=$?` and `npm test -- process > /tmp/t.log 2>&1; rc=$?` → PASS. (Also reconciled the pre-existing #229 deproject tests whose "taller" premise the square design replaces: `export.deproject.test.ts`, `process.deproject.test.ts` now assert square; `export.calibration.test.ts` derives `expected` from the normalised crop.)
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous-curator/plugin/routes/export.ts tools/famous-curator/plugin/routes/process.ts tests/tools/famous-curator/export.test.ts`.

---

## Task 6: `deriveFamousCalibration` deprojected branch

**Files:**
- Modify: `tools/famous/deriveFamousCalibration.ts`
- Test: `tests/tools/famous/deriveFamousCalibration.test.ts` (existing — extend; this lives under `tests/tools/famous/`, NOT `famous-curator/`)

**Behaviour:** when `input.deprojected === true`, the function receives the **normalised (square-deproject) crop** (export passes the normalised crop — Task 5). In that frame:
- `crop.rotationDeg === disk.paDeg`, so the existing `normalizePa(disk.paDeg - crop.rotationDeg)` already yields **PA = 0** — assert it, no new code path needed for PA.
- emitted **`axisRatio = 1`** (texture is face-on; runtime must not re-tilt). The non-deprojected branch keeps `disk.axisRatio ?? catalogAxisRatio`.
- **center / diskRadiusFrac account for the minor-axis stretch.** In the final square the disk is round with radius `disk.radiusPx` (the major-axis extent, image-X, unstretched). The crop half-width is `crop.width / 2`. So `diskRadiusFrac = disk.radiusPx / (crop.width / 2)`. For the centre: map the disk centre into the crop-local frame (existing `R(-rotationDeg)` step), then the local-Y is stretched by `1/(b/a)` (the image-Y deproject stretch) before normalising against the square half-width (`crop.width / 2`). Local-X is unchanged. So:
  - `localX' = localX`
  - `localY' = localY / effectiveAxisRatio`   (b/a = effectiveAxisRatio)
  - `center = [(localX' + halfW) / crop.width, (localY' + halfW) / crop.width]` with `halfW = crop.width / 2`.

  Use `effectiveAxisRatio = disk.axisRatio ?? catalogAxisRatio` for the stretch factor (same chain export uses).

**Pin the contract:** `DeriveCalibrationInput` is unchanged (it already carries `deprojected`). Only the function body branches on it.

**Full test code (extend deriveFamousCalibration.test.ts):**

```ts
describe('deriveFamousCalibration deprojected branch', () => {
  // Normalised square-deproject crop: rotationDeg === disk.paDeg, height = width*aspect.
  const aspect = 0.5;
  const crop = { x: 100, y: 100, width: 400, height: 200, rotationDeg: 30 };
  const disk = {
    centerPx: [300, 200] as [number, number], // off-centre vs crop centre (300,200)
    radiusPx: 80, paDeg: 30, axisRatio: aspect, deproject: true,
  };

  it('emits PA = 0 (texture is face-on)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.paDeg).toBe(0);
  });

  it('emits axisRatio = 1 (no runtime re-tilt)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.axisRatio).toBe(1);
  });

  it('diskRadiusFrac is radiusPx / (crop.width/2)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.diskRadiusFrac).toBeCloseTo(80 / (400 / 2), 6); // 0.8
  });

  it('center accounts for the minor-axis stretch (off-centre disk)', () => {
    // Disk centre = crop centre here ⇒ local (0,0) ⇒ normalised (0.5,0.5)
    // even after the Y stretch (0/aspect = 0).
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.center[0]).toBeCloseTo(0.5, 6);
    expect(cal.center[1]).toBeCloseTo(0.5, 6);
  });

  it('center Y-stretch: a disk offset along the minor axis grows post-deproject', () => {
    // Move the disk centre off the crop centre along image-Y (paDeg=0 case for clarity).
    const c2 = { x: 0, y: 0, width: 400, height: 200, rotationDeg: 0 };
    const d2 = { centerPx: [200, 120] as [number, number], radiusPx: 40, paDeg: 0, axisRatio: aspect, deproject: true };
    // localY = 120 - 100 = 20; stretched = 20 / 0.5 = 40; normalised = (40 + 200)/400 = 0.6
    const cal = deriveFamousCalibration({ disk: d2, crop: c2, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.center[1]).toBeCloseTo(0.6, 6);
    expect(cal.center[0]).toBeCloseTo(0.5, 6);
  });

  it('non-deprojected branch is unchanged', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: false });
    expect(cal.axisRatio).toBe(aspect);
    expect(cal.deprojected).toBe(false);
  });
});
```

- [x] Add the tests; `npm test -- deriveFamousCalibration > /tmp/t.log 2>&1; rc=$?` → FAIL (deprojected branch not implemented).
- [x] Implement the branch (header note documenting the Y-stretch reasoning; `effectiveAxisRatio` fallback chain; emit `axisRatio: 1` only when `deprojected`).
- [x] `npm test -- deriveFamousCalibration > /tmp/t.log 2>&1; rc=$?` → PASS.
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous/deriveFamousCalibration.ts tests/tools/famous/deriveFamousCalibration.test.ts`.

---

## Task 7: `CropCanvas` — `deprojectAspect` prop + rotation/aspect lock

**Files:**
- Modify: `tools/famous-curator/ui/components/CropCanvas.tsx`
- Test: `tests/tools/famous-curator/ui/components/CropCanvas.test.tsx` (existing — extend; note the `components/` subdir)

**Real signature (read before writing):** `CropCanvasProps` is `{ source: { width; height; previewUrl } | undefined; crop: Crop | undefined; onCropChange; onFileDrop; disk?; catalogAxisRatio?; onDiskChange; downloadOriginalUrl? }`. `mode` (`'crop' | 'disk'`) is **internal `useState`, NOT a prop** (`CropCanvas.tsx:96`). The rotate control today is two elements: `.curator-crop-rotate-stem` + a `.curator-crop-handle--rotate` span with `data-handle="rotate"` (`CropCanvas.tsx:375-388`); the "Reset rotation" `<button>` is at `CropCanvas.tsx:279-284`. Resize handles are `<span data-handle="nw|n|ne|e|se|s|sw|w">` (no `data-testid` today). The resize switch is at `CropCanvas.tsx:174-202`.

**Contract:** add to `CropCanvasProps`:

```ts
/** undefined = square/as-shot (today's behaviour); a number = locked aspect (height/width = b/a). */
deprojectAspect?: number | undefined;
```

**Behaviour:** when `deprojectAspect` is a number:
- the rotate knob (`.curator-crop-handle--rotate` span + stem) + the "Reset rotation" button are NOT rendered;
- the resize switch (`CropCanvas.tsx:174-202`) dispatches to the `resizeCornerAspect*` / `resizeEdgeAspect*` helpers with `deprojectAspect` (rotation carried through; App owns locking `rotationDeg = disk.paDeg`);
- body-drag (free move) is unchanged (`translateCrop`).

When `deprojectAspect` is `undefined`: today's square path verbatim (every existing test stays green).

> **Testid note:** the existing handles use `data-handle="..."` not `data-testid`. The test below queries by `data-handle` via `container.querySelector`. Add `data-testid="rotate-handle"` to the rotate span as a small affordance so the "absent" assertion is robust.

**Full test code (extend the existing CropCanvas.test.tsx; it already imports `render`, `CropCanvas`, and constructs a `source` with `previewUrl`):**

```ts
const baseProps = {
  source: { width: 1000, height: 1000, previewUrl: 'data:,' },
  crop: { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 },
  onFileDrop: () => {},
  disk: undefined,
  catalogAxisRatio: 0.5,
  onDiskChange: () => {},
};

it('hides the rotate handle when deprojectAspect is set', () => {
  const { container } = render(
    <CropCanvas {...baseProps} onCropChange={() => {}} deprojectAspect={0.5} />,
  );
  expect(container.querySelector('[data-handle="rotate"]')).toBeNull();
});

it('still shows the rotate handle in as-shot mode (deprojectAspect undefined)', () => {
  const { container } = render(
    <CropCanvas {...baseProps} onCropChange={() => {}} deprojectAspect={undefined} />,
  );
  expect(container.querySelector('[data-handle="rotate"]')).not.toBeNull();
});

it('keeps aspect on a corner resize when deprojectAspect is set', () => {
  const onCropChange = vi.fn();
  const { container } = render(
    <CropCanvas {...baseProps} onCropChange={onCropChange} deprojectAspect={0.5} />,
  );
  const se = container.querySelector('[data-handle="se"]') as Element;
  fireEvent.pointerDown(se, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(se, { clientX: 80, clientY: 80 });
  fireEvent.pointerUp(se);
  const last = onCropChange.mock.calls.at(-1)?.[0];
  expect(last.height).toBeCloseTo(last.width * 0.5, 0);
});
```

> jsdom returns a zero-size `getBoundingClientRect` by default; the React test setup stubs it (the existing CropCanvas tests rely on this). If the corner-resize assertion can't get a non-zero `canvasScale` in jsdom, the implementer keeps the two rotate-handle-presence assertions (which don't need layout) and verifies aspect-keeping via a direct `cropMath` unit test (Task 3 already covers that) — note the chosen split in the task checkbox. The square-path tests in this file must remain green.

- [x] Add the prop + tests; `npm test -- CropCanvas > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [x] Implement: branch resize handlers + hide rotate control on `deprojectAspect`. Comment-tidy.
- [x] `npm test -- CropCanvas > /tmp/t.log 2>&1; rc=$?` → PASS (incl. existing square tests).
- [x] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [x] Commit `tools/famous-curator/ui/components/CropCanvas.tsx tests/tools/famous-curator/ui/components/CropCanvas.test.tsx`.

---

## Task 8: `DiskOverlay` — live crop-preview rect

**Files:**
- Modify: `tools/famous-curator/ui/components/DiskOverlay.tsx`
- Test: `tests/tools/famous-curator/ui/components/DiskOverlay.test.tsx` (existing — extend; note the `components/` subdir)

**Real signature (read before writing):** `DiskOverlayProps` is `{ source: { width; height; previewUrl }; disk: RecipeDisk | undefined; catalogAxisRatio?; interactive: boolean; onDiskChange }`. The component is an SVG with `viewBox="0 0 source.width source.height"` (geometry in source px, NO `canvasScale` prop — it computes scale internally via ResizeObserver). The export is a **named** export (`export function DiskOverlay(...)`), imported as `{ DiskOverlay }`. The ellipse transform is `rotate(${disk.paDeg}, ${cx}, ${cy})` (`DiskOverlay.tsx:215-216`) — match that comma-form. `effectiveAxisRatio = disk.axisRatio ?? catalogAxisRatio ?? 1` already exists at `DiskOverlay.tsx:213`.

**Behaviour:** when `interactive` is true AND `deprojectAspect` is a number AND a disk exists, draw the to-be-cropped rectangle in source-px user units:
- centred on `disk.centerPx`, width `2·disk.radiusPx·(1 + (margin ?? DEFAULT_DISK_MARGIN))`, height `width·deprojectAspect`, PA-rotated via `transform={`rotate(${disk.paDeg}, ${cx}, ${cy})`}`;
- darken outside it via an SVG `<mask>` (a full-canvas white `<rect>` + a black rotated `<rect>` = a hole) applied to a semi-transparent black overlay `<rect>` covering the viewBox;
- the preview rect outlined with `vectorEffect="non-scaling-stroke"` (match the overlay's existing non-scaling-stroke discipline), `data-testid="crop-preview-rect"`.

Reuse a shared corner/extent helper rather than duplicating the rotate math. A pure helper computing the rect's source-px geometry (centre + half-extents, pre-rotation) belongs in `diskOverlay.ts` (e.g. `deprojectPreviewRect(disk, aspect, margin): { x; y; width; height }`) with its own unit test; the SVG `transform` carries the rotation so the component stays DOM-only. If `seedDeprojectCrop` (Task 3) already yields the same rect, the helper can wrap it.

**Contract addition to `DiskOverlayProps`:**

```ts
/** Locked aspect (height/width = b/a) for the preview rect; absent ⇒ no preview drawn. */
deprojectAspect?: number | undefined;
/** Seed margin for the preview-rect framing; DEFAULT_DISK_MARGIN when absent. */
margin?: number | undefined;
```

**Full test code (extend the existing components/DiskOverlay.test.tsx — it already has the jsdom directive + `{ DiskOverlay }` import + a `source` with `previewUrl`):**

```ts
const previewDisk: RecipeDisk = {
  centerPx: [300, 300], radiusPx: 80, paDeg: 30, axisRatio: 0.5, deproject: true,
};
const src = { width: 1000, height: 1000, previewUrl: 'data:,' };

it('renders crop-preview-rect when interactive + deproject active', () => {
  const { queryByTestId } = render(
    <DiskOverlay source={src} disk={previewDisk} catalogAxisRatio={0.5}
      interactive={true} onDiskChange={() => {}} deprojectAspect={0.5} margin={0.25} />,
  );
  expect(queryByTestId('crop-preview-rect')).not.toBeNull();
});

it('omits crop-preview-rect when deprojectAspect is undefined', () => {
  const { queryByTestId } = render(
    <DiskOverlay source={src} disk={previewDisk} catalogAxisRatio={0.5}
      interactive={true} onDiskChange={() => {}} deprojectAspect={undefined} margin={undefined} />,
  );
  expect(queryByTestId('crop-preview-rect')).toBeNull();
});
```

- [ ] Add the tests; `npm test -- DiskOverlay > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [ ] Implement the preview rect + mask (+ the pure `deprojectPreviewRect` helper in `diskOverlay.ts` with its own unit test). Comment-tidy.
- [ ] `npm test -- DiskOverlay > /tmp/t.log 2>&1; rc=$?` → PASS.
- [ ] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [ ] Manual visual check (curator dev server): preview rect appears + darkens outside only when deproject is on. _(VISUAL — pending user)_
- [ ] Commit `tools/famous-curator/ui/components/DiskOverlay.tsx tools/famous-curator/ui/diskOverlay.ts tests/tools/famous-curator/ui/components/DiskOverlay.test.tsx tests/tools/famous-curator/ui/diskOverlay.test.ts`.

---

## Task 9: `DiskControls` — margin slider

**Files:**
- Modify: `tools/famous-curator/ui/components/DiskControls.tsx`
- Test: `tests/tools/famous-curator/ui/components/DiskControls.test.tsx` (existing — extend; note the `components/` subdir)

**Real signature (read before writing):** `DiskControlsProps` is `{ disk: RecipeDisk | undefined; catalogAxisRatio: number | undefined; onDiskChange }` — NO `mode`/`onModeChange`/`onClearDisk`. Named export `{ DiskControls }`. Returns `null` when `disk === undefined` (`DiskControls.tsx:33`). `effectiveAxisRatio = disk.axisRatio ?? catalogAxisRatio ?? 1` already exists at `DiskControls.tsx:36`.

**Behaviour:** add a margin slider (`<input type="range">`) that renders ONLY when `disk !== undefined` AND `disk.deproject === true`. It edits `disk.margin` (dispatching `onDiskChange({ ...disk, margin: Number(e.target.value) })`), defaulting the displayed value to `DEFAULT_DISK_MARGIN` when `disk.margin` is absent. Range `min=0 max=1 step=0.05`. `data-testid="margin-slider"`.

**Full test code (extend the existing components/DiskControls.test.tsx — it already has the jsdom directive + `{ DiskControls }` import):**

```ts
const base: RecipeDisk = { centerPx: [1, 2], radiusPx: 3, paDeg: 4, axisRatio: 0.5, deproject: true };

describe('DiskControls margin slider', () => {
  it('renders the slider only when deproject is on', () => {
    const { queryByTestId, rerender } = render(
      <DiskControls disk={base} catalogAxisRatio={0.5} onDiskChange={() => {}} />,
    );
    expect(queryByTestId('margin-slider')).not.toBeNull();
    rerender(
      <DiskControls disk={{ ...base, deproject: false }} catalogAxisRatio={0.5} onDiskChange={() => {}} />,
    );
    expect(queryByTestId('margin-slider')).toBeNull();
  });

  it('dispatches a new margin on change', () => {
    const onDiskChange = vi.fn();
    const { getByTestId } = render(
      <DiskControls disk={base} catalogAxisRatio={0.5} onDiskChange={onDiskChange} />,
    );
    fireEvent.change(getByTestId('margin-slider'), { target: { value: '0.5' } });
    expect(onDiskChange).toHaveBeenCalledWith(expect.objectContaining({ margin: 0.5 }));
  });
});
```

- [ ] Write the test file; `npm test -- DiskControls > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [ ] Implement the slider (import `DEFAULT_DISK_MARGIN`). Comment-tidy.
- [ ] `npm test -- DiskControls > /tmp/t.log 2>&1; rc=$?` → PASS.
- [ ] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [ ] Commit `tools/famous-curator/ui/components/DiskControls.tsx tests/tools/famous-curator/ui/DiskControls.test.tsx`.

---

## Task 10: `state.ts` — margin + non-destructive deproject-crop coupling

**Files:**
- Modify: `tools/famous-curator/ui/state.ts`
- Test: `tests/tools/famous-curator/ui/state.test.ts` (existing — extend)

**Behaviour / decisions:**
- `setDisk` already marks `dirty.disk`. When a `setDisk` flips `deproject` on/off OR changes `margin`/`axisRatio`/`paDeg` while deprojected, the crop must also be re-derived. **Decision:** keep the reducer pure and put the crop *seeding/restoring* in App (Task 11) — but the reducer must support a **non-destructive toggle**: stash the user's as-shot square crop so toggling deproject OFF restores it rather than resetting.
  - Add `savedSquareCrop: Crop | undefined` to `State` (the last as-shot crop before deproject was turned on).
  - New action `{ type: 'setDeprojectCrop'; crop: Crop; savedSquareCrop?: Crop }` OR extend `setCrop` semantics — **recommended:** a dedicated action `setDeprojectCrop` that sets `crop` + marks `dirty.crop` (deproject crop changes must re-Process) and, when transitioning ON, records `savedSquareCrop` from the current `crop`; and `{ type: 'restoreSquareCrop' }` that sets `crop = savedSquareCrop ?? crop` and clears the saved slot. This keeps `setCrop` (as-shot) unchanged.
- `selectGalaxy` resets `savedSquareCrop` to `undefined` (mirrors how it resets `disk`/`crop` via `...initialState`).

**Contract:**

```ts
// State gains:
savedSquareCrop: Crop | undefined;

// Action union gains:
| { type: 'setDeprojectCrop'; crop: Crop }
| { type: 'restoreSquareCrop' }
```

`setDeprojectCrop`: `{ ...state, crop: action.crop, savedSquareCrop: state.savedSquareCrop ?? state.crop, dirty: { ...state.dirty, crop: true } }`.
`restoreSquareCrop`: `{ ...state, crop: state.savedSquareCrop ?? state.crop, savedSquareCrop: undefined, dirty: { ...state.dirty, crop: true } }`.

**Full test code (extend state.test.ts):**

```ts
const sq = { x: 100, y: 100, width: 200, height: 200, rotationDeg: 0 };
const rect = { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 };

it('setDeprojectCrop saves the prior square crop on first transition', () => {
  let s = reducer(initialState, { type: 'setCrop', crop: sq });
  s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
  expect(s.crop).toEqual(rect);
  expect(s.savedSquareCrop).toEqual(sq);
  expect(s.dirty.crop).toBe(true);
});

it('restoreSquareCrop restores the saved square and clears the slot', () => {
  let s = reducer(initialState, { type: 'setCrop', crop: sq });
  s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
  s = reducer(s, { type: 'restoreSquareCrop' });
  expect(s.crop).toEqual(sq);
  expect(s.savedSquareCrop).toBeUndefined();
});

it('selectGalaxy clears savedSquareCrop', () => {
  let s = reducer(initialState, { type: 'setCrop', crop: sq });
  s = reducer(s, { type: 'setDeprojectCrop', crop: rect });
  s = reducer(s, { type: 'selectGalaxy', id: 'm51' }); // real action shape: { type, id }
  expect(s.savedSquareCrop).toBeUndefined();
});
```

- [ ] Add the tests; `npm test -- state > /tmp/t.log 2>&1; rc=$?` → FAIL.
- [ ] Add `savedSquareCrop` (default `undefined` in `initialState`), the two actions, the reducer cases. Comment-tidy.
- [ ] `npm test -- state > /tmp/t.log 2>&1; rc=$?` → PASS (incl. existing).
- [ ] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [ ] Commit `tools/famous-curator/ui/state.ts tests/tools/famous-curator/ui/state.test.ts`.

---

## Task 11: `App.tsx` — seed/normalise crop on deproject toggle; thread `deprojectAspect`

**Files:**
- Modify: `tools/famous-curator/ui/App.tsx`
- Test: App wiring is verified by typecheck + the unit-tested helpers/reducer it composes + the existing `tests/tools/famous-curator/ui/App.test.tsx` / `App.resumable.test.tsx` staying green + manual check. The coupling LOGIC lives in the reducer (Task 10) and pure helpers (Tasks 2-3) which ARE unit-tested; do NOT add a new brittle full-App mount test for the geometry. If extending an App test is cheap, assert that toggling deproject in `onDiskChange` dispatches a `setDeprojectCrop` (mock the api + reducer-observe), but typecheck + the existing App tests are the gate.

**Behaviour:** App owns the deproject-crop coupling, composing the tested pieces:
- Compute `deprojectAspect` = (when `state.disk?.deproject` AND `willDeproject(effectiveAxisRatio)`) `effectiveAxisRatio`, else `undefined`, where `effectiveAxisRatio = state.disk?.axisRatio ?? state.catalogAxisRatio ?? 1`. Pass it to `CropCanvas` (and to `DiskOverlay` via CropCanvas's existing prop forwarding — thread `margin` too).
- When deproject transitions ON (toggle in DiskControls, or a disk first drawn with deproject auto-on): dispatch `setDeprojectCrop` with `seedDeprojectCrop(disk.centerPx, disk.radiusPx, disk.paDeg, effectiveAxisRatio, disk.margin ?? DEFAULT_DISK_MARGIN, state.source)`.
- When the margin/paDeg/axisRatio changes while deprojected: re-dispatch `setDeprojectCrop` with a freshly seeded crop (so the framing tracks the disk + margin).
- When deproject transitions OFF: dispatch `restoreSquareCrop`.
- The deproject crop's `rotationDeg` is always `disk.paDeg` (set by `seedDeprojectCrop`); App never lets the user rotate it (CropCanvas hides the knob — Task 7).

> **Where to hook the transition:** the cleanest spot is App's `onDiskChange` handler (it already dispatches `setDisk`). Compare the incoming `deproject`/`margin`/`paDeg`/`axisRatio` against `state.disk` to decide seed-vs-restore-vs-reseed, then dispatch `setDisk` plus the appropriate crop action. Use `willDeproject` (single deproject gate) — do NOT re-implement the `0<b/a<1` test. Comment this coupling clearly (it's the non-obvious part).

- [ ] Implement the coupling in App (`willDeproject` from `tools/famous/deprojectDisk`; `seedDeprojectCrop` from cropMath; `DEFAULT_DISK_MARGIN` from `src/data/famousCalibration`). Thread `deprojectAspect` + `margin` to CropCanvas → DiskOverlay. Comment-tidy.
- [ ] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [ ] `npm test > /tmp/t.log 2>&1; rc=$?` → Read log, full suite green.
- [ ] Manual check (curator dev server): toggle deproject ON → crop snaps to a PA-rotated b/a rect framing the disk; rotate knob gone; margin slider re-frames; toggle OFF → prior square crop returns. _(VISUAL — pending user)_
- [ ] Commit `tools/famous-curator/ui/App.tsx`.

---

## Task 12: end-to-end square-output guard (final verification)

**Files:**
- Test: already added in Task 5 (`export.test.ts`) — this task is the consolidation gate, no new code.

**Behaviour:** confirm the whole chain holds: a deproject ON export for a tilted disk produces square `source.webp` + `full.webp` + `atlas.webp`, the emitted `calibration` has `paDeg === 0` and `axisRatio === 1`, and as-shot is unchanged.

- [ ] Extend the Task-5 export test (or add one) asserting `res.calibration?.paDeg === 0` and `res.calibration?.axisRatio === 1` for the tilted deproject case, and that `atlas.webp` is square too.
- [ ] `npm test > /tmp/t.log 2>&1; rc=$?` → full suite green.
- [ ] `npm run typecheck > /tmp/tc.log 2>&1; rc=$?` → `rc == 0`.
- [ ] Commit the test.

---

## Execution order (one implementer, sequential)

Pure geometry + constants first (no UI/pipeline deps), then pipeline wiring, then UI, then App glue, then the e2e gate:

1. **Task 1** — `DEFAULT_DISK_MARGIN` (constant; everything else imports it).
2. **Task 2** — `squareDeprojectCrop` (pure; routes depend on it).
3. **Task 3** — `cropMath` aspect helpers + `seedDeprojectCrop` (pure; UI + App depend).
4. **Task 4** — `RecipeDisk.margin` (recipe shape; UI + App depend).
5. **Task 5** — export/process call `squareDeprojectCrop` (pipeline; depends on 2).
6. **Task 6** — `deriveFamousCalibration` deprojected branch (depends on 5's normalised crop).
7. **Task 7** — `CropCanvas` `deprojectAspect` lock (depends on 3).
8. **Task 8** — `DiskOverlay` crop preview (depends on 3, 4).
9. **Task 9** — `DiskControls` margin slider (depends on 4).
10. **Task 10** — `state.ts` margin + non-destructive toggle coupling.
11. **Task 11** — `App.tsx` seed/normalise + threading (depends on 3, 4, 7, 8, 9, 10).
12. **Task 12** — e2e square-output guard.

---

## Cross-plan type / name consistency

A single canonical name/shape for each concept — every task uses these exactly:

- **`DEFAULT_DISK_MARGIN`** — `src/data/famousCalibration.ts`, value `0.25`. The ONLY source for the seed margin default; curator-seed, recipe default, UI slider default all import it.
- **`DEPROJECT_MIN_AXIS_RATIO`** — unchanged, advisory UI seed/warning only (`famousCalibration.ts`).
- **`willDeproject(axisRatio)`** — `tools/famous/deprojectDisk.ts` — THE single deproject gate (`0 < b/a < 1`). App, routes, and any new code consult it; never re-implement the range test.
- **`squareDeprojectCrop(crop, disk, effectiveAxisRatio): RotatedCrop`** — `tools/famous/squareDeprojectCrop.ts` — shared by BOTH `export.ts` and `process.ts`. Returns a `RotatedCrop` (`tools/famous-curator/plugin/cropExtract.ts`).
- **`seedDeprojectCrop(centerPx, radiusPx, paDeg, aspect, margin, bounds): Crop`** — `tools/famous-curator/ui/cropMath.ts` — used by App on the deproject toggle. `Crop` is `cropMath`'s type.
- **`deprojectAspect?: number | undefined`** — prop name on BOTH `CropCanvas` and `DiskOverlay`; `undefined` = as-shot/square, a number = locked `aspect = height/width = b/a`. App computes it once and threads it down.
- **`margin?: number`** — optional field on `RecipeDisk` (`recipe.ts`); prop `margin?: number | undefined` on `DiskOverlay`; slider in `DiskControls` editing `disk.margin`.
- **`effectiveAxisRatio`** — the chain `disk.axisRatio ?? catalogAxisRatio ?? 1` (UI) / `disk?.axisRatio ?? catalogAxisRatio` (pipeline, where `catalogAxisRatio` is required). Match each call site's existing chain; do not introduce a fourth fallback shape.
- **`aspect`** convention — always `height / width = b/a`. `cropMath` aspect helpers, `squareDeprojectCrop`, and the `deprojectAspect` prop all use this orientation.
- **`savedSquareCrop: Crop | undefined`** + actions **`setDeprojectCrop`** / **`restoreSquareCrop`** — `state.ts` only. `setCrop` stays the as-shot action.
- **Test locations (verified against the real tree):**
  - `squareDeprojectCrop.test.ts`, `recipe.test.ts`, `export.test.ts` (route test) → the route export test is `tests/tools/famous-curator/routes/export.test.ts`; pure pipeline helper tests sit at `tests/tools/famous-curator/` root (e.g. `recipe.test.ts`). Put `squareDeprojectCrop.test.ts` at `tests/tools/famous-curator/`.
  - `deprojectDisk.test.ts`, `deriveFamousCalibration.test.ts` live under **`tests/tools/famous/`** (the famous-tool dir) — extend `deriveFamousCalibration.test.ts` there.
  - `cropMath.test.ts`, `state.test.ts`, `diskOverlay.test.ts` → `tests/tools/famous-curator/ui/`.
  - `CropCanvas.test.tsx`, `DiskOverlay.test.tsx`, `DiskControls.test.tsx` → `tests/tools/famous-curator/ui/components/` (NOT directly under `ui/`). All component tests already carry `// @vitest-environment jsdom`.
- **`FamousCalibration`** shape unchanged — the deprojected branch sets existing fields (`paDeg=0`, `axisRatio=1`, `deprojected=true`); no new field.
